// Package api is the HTTP layer: routing, auth, request parsing and responses. Business rules live in
// dispatch, SQL lives in store.
package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/config"
	"fleetline/api/internal/dispatch"
	"fleetline/api/internal/realtime"
	"fleetline/api/internal/store"
)

type Server struct {
	cfg    config.Config
	st     *store.Store
	svc    *dispatch.Service
	hub    *realtime.Hub
	pub    *realtime.Publisher
	tokens tokens
	reseed func(context.Context) error
}

func New(cfg config.Config, st *store.Store, svc *dispatch.Service, hub *realtime.Hub, pub *realtime.Publisher, reseed func(context.Context) error) *Server {
	return &Server{cfg: cfg, st: st, svc: svc, hub: hub, pub: pub, tokens: tokens{secret: []byte(cfg.TokenSecret)}, reseed: reseed}
}

// Handler builds the router. Route groups follow the endpoint list; catalog.go has the full table.
func (s *Server) Handler() http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), requestLog(), securityHeaders(), cors(s.cfg.AllowedOrigins))
	r.HandleMethodNotAllowed = true
	r.NoRoute(func(c *gin.Context) { fail(c, http.StatusNotFound, "not_found", "No such endpoint") })

	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	r.GET("/readyz", s.ready)

	v1 := r.Group("/api/v1")

	// No credentials: sign-in, health, and telephony webhooks (which carry their own shared secret).
	v1.POST("/users/authenticate", s.authenticateUser)
	v1.POST("/drivers/authenticate", s.authenticateDriver)
	v1.GET("/app/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"pong": true, "now": time.Now().UnixMilli()}) })
	hooks := v1.Group("", s.webhookAuth())
	s.telephonyRoutes(hooks)

	authed := v1.Group("", s.authenticate(s.cfg.AuthRequired))
	authed.GET("/ws", operatorOnly(), func(c *gin.Context) { s.hub.Serve(c.Writer, c.Request) })

	// Driver app: a driver token may act only as itself; operators may act for any driver.
	driverApp := authed.Group("/drivers/:id", selfOrOperator("driver", "id"))
	s.driverAppRoutes(driverApp)

	// Passenger app: quotes, address search, and booking as themselves.
	s.passengerRoutes(authed)

	// Dispatcher endpoints.
	ops := authed.Group("", operatorOnly())
	s.consoleRoutes(ops)
	s.catalogRoutes(ops)
	return r
}

func (s *Server) ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c, 2*time.Second)
	defer cancel()
	dbErr := s.st.DB.PingContext(ctx)
	redisErr := s.st.Live.Redis().Ping(ctx).Err()
	status := http.StatusOK
	if dbErr != nil || redisErr != nil {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, gin.H{"postgres": dbErr == nil, "redis": redisErr == nil, "consoles": s.hub.Count()})
}

// selfOrOperator lets a driver (or passenger) token through only for its own id.
func selfOrOperator(kind, param string) gin.HandlerFunc {
	return func(c *gin.Context) {
		p := principal(c)
		if p.Kind == "operator" || (p.Kind == kind && p.ID == c.Param(param)) {
			c.Next()
			return
		}
		fail(c, http.StatusForbidden, "forbidden", "You can only act for your own account")
	}
}
