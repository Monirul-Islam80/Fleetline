package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"fleetline/api/internal/domain"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 50 * time.Second
	sendBuffer = 256
)

// Hub holds this instance's WebSocket clients and forwards every batch from Redis to them.
type Hub struct {
	rdb      *redis.Client
	upgrader websocket.Upgrader

	mu      sync.RWMutex
	clients map[*client]struct{}
}

type client struct {
	conn *websocket.Conn
	send chan []byte
}

// NewHub accepts connections from the listed origins ("*" allows any, for local testing only).
func NewHub(rdb *redis.Client, allowedOrigins []string) *Hub {
	allowAll := false
	allowed := map[string]bool{}
	for _, o := range allowedOrigins {
		if o == "*" {
			allowAll = true
		}
		allowed[o] = true
	}
	return &Hub{
		rdb:     rdb,
		clients: map[*client]struct{}{},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 16 * 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				return origin == "" || allowAll || allowed[origin]
			},
		},
	}
}

// Count is the number of consoles connected to this instance.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Broadcast sends a raw batch to every client on this instance. Slow clients are dropped, not waited on.
func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
			go h.drop(c)
		}
	}
}

func (h *Hub) drop(c *client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
	}
	h.mu.Unlock()
}

// Run subscribes to Redis and sends a clock heartbeat each second, so console timers keep moving when nothing changes.
func (h *Hub) Run(ctx context.Context) {
	sub := h.rdb.Subscribe(ctx, Channel)
	defer sub.Close()
	messages := sub.Channel()
	heartbeat := time.NewTicker(time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case m, ok := <-messages:
			if !ok {
				return
			}
			h.Broadcast([]byte(m.Payload))
		case <-heartbeat.C:
			h.Broadcast(heartbeatBatch())
		}
	}
}

// heartbeat is an empty batch carrying only the server clock. Arrays stay [] for the console's `.length` checks.
func heartbeatBatch() []byte {
	raw, _ := json.Marshal(Batch{Now: time.Now().UnixMilli(), Jobs: []Update{}, Drivers: []Update{}, Events: []domain.JobEvent{}, Alerts: []domain.Alert{}})
	return raw
}

// Serve upgrades the request and runs the client until it disconnects. The socket is server-to-console only.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Debug("websocket upgrade", "err", err)
		return
	}
	c := &client{conn: conn, send: make(chan []byte, sendBuffer)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	go h.writeLoop(c)
	h.readLoop(c)
}

func (h *Hub) readLoop(c *client) {
	defer func() {
		h.drop(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { return c.conn.SetReadDeadline(time.Now().Add(pongWait)) })
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *Hub) writeLoop(c *client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
