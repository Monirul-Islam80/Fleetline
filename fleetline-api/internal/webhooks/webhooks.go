// Package webhooks delivers booking events to URLs registered with POST /events/listeners.
// It listens to the same Redis channel as the consoles. One instance (the leader) delivers, so each
// listener gets every event once. Payloads are signed with the listener's secret (X-Fleet-Signature).
package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/realtime"
	"fleetline/api/internal/store"
)

type listener struct {
	ID     string
	URL    string
	Secret string
	Events map[string]bool
}

type Deliverer struct {
	st       *store.Store
	instance string
	client   *http.Client
	slots    chan struct{} // at most this many deliveries in flight

	listeners []listener
	loadedAt  time.Time
}

func New(st *store.Store, instance string) *Deliverer {
	return &Deliverer{st: st, instance: instance, client: &http.Client{Timeout: 5 * time.Second}, slots: make(chan struct{}, 16)}
}

func (d *Deliverer) Run(ctx context.Context) {
	sub := d.st.Live.Redis().Subscribe(ctx, realtime.Channel)
	defer sub.Close()
	for {
		select {
		case <-ctx.Done():
			return
		case m, ok := <-sub.Channel():
			if !ok {
				return
			}
			var batch realtime.Batch
			if json.Unmarshal([]byte(m.Payload), &batch) != nil || len(batch.Events) == 0 {
				continue
			}
			if !d.st.Live.Leader(ctx, "webhooks", d.instance, 30*time.Second) {
				continue
			}
			d.refresh(ctx)
			for _, e := range batch.Events {
				for _, l := range d.listeners {
					if l.Events[e.Type] {
						d.send(ctx, l, e)
					}
				}
			}
		}
	}
}

// refresh reloads listeners at most every 10 seconds.
func (d *Deliverer) refresh(ctx context.Context) {
	if time.Since(d.loadedAt) < 10*time.Second {
		return
	}
	items, _, err := d.st.ListResources(ctx, "event_listeners", store.ResourceQuery{Limit: 500})
	if err != nil {
		slog.Warn("webhooks: load listeners", "err", err)
		return
	}
	d.listeners = d.listeners[:0]
	for _, it := range items {
		if active, _ := it["active"].(bool); !active {
			continue
		}
		l := listener{Events: map[string]bool{}}
		l.ID, _ = it["id"].(string)
		l.URL, _ = it["url"].(string)
		l.Secret, _ = it["secret"].(string)
		if list, ok := it["events"].([]any); ok {
			for _, e := range list {
				if s, ok := e.(string); ok {
					l.Events[s] = true
				}
			}
		}
		d.listeners = append(d.listeners, l)
	}
	d.loadedAt = time.Now()
}

func (d *Deliverer) send(ctx context.Context, l listener, e domain.JobEvent) {
	select {
	case d.slots <- struct{}{}:
	default:
		slog.Warn("webhooks: delivery backlog full, dropping", "listener", l.ID)
		return
	}
	go func() {
		defer func() { <-d.slots }()
		payload, _ := json.Marshal(map[string]any{"type": "booking." + e.Type, "event": e, "sentAt": time.Now().UnixMilli()})
		mac := hmac.New(sha256.New, []byte(l.Secret))
		mac.Write(payload)
		for attempt := 0; attempt < 3; attempt++ {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.URL, bytes.NewReader(payload))
			if err != nil {
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Fleet-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
			res, err := d.client.Do(req)
			if err == nil {
				res.Body.Close()
				if res.StatusCode < 500 {
					return
				}
			}
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
		slog.Warn("webhooks: delivery failed", "listener", l.ID, "url", l.URL)
	}()
}
