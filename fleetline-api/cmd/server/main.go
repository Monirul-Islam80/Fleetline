// Command server runs the Fleetline dispatch API: REST, WebSocket, the 15-second offer engine,
// the GPS flusher, webhook delivery and (for demos) the driver simulator, in one process.
// Run several copies behind a load balancer: Redis Pub/Sub keeps their consoles in step, and a Redis
// lease makes sure only one of them dispatches.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"fleetline/api/internal/api"
	"fleetline/api/internal/config"
	"fleetline/api/internal/db"
	"fleetline/api/internal/dispatch"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/live"
	"fleetline/api/internal/realtime"
	"fleetline/api/internal/seed"
	"fleetline/api/internal/sim"
	"fleetline/api/internal/store"
	"fleetline/api/internal/webhooks"
)

func main() {
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	fleet.SetLocation(cfg.FleetTimeZone)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	conn, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer conn.Close()
	if err := db.Migrate(ctx, conn); err != nil {
		return err
	}

	ropts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb := redis.NewClient(ropts)
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return errors.Join(errors.New("connect to redis"), err)
	}

	lv := live.New(rdb)
	st := store.New(conn, lv)
	reseed := func(c context.Context) error {
		lv.Reset(c)
		return seed.Reset(c, st)
	}
	if cfg.SeedOnEmpty && seed.Empty(ctx, st) {
		slog.Info("empty database, loading the demo fleet")
		if err := reseed(ctx); err != nil {
			return err
		}
	}

	pub := realtime.NewPublisher(rdb, cfg.PublishInterval)
	hub := realtime.NewHub(rdb, cfg.AllowedOrigins)
	pub.FallbackTo(hub.Broadcast)
	svc := dispatch.New(st, pub, dispatch.Config{
		OfferTimeout:       cfg.OfferTimeout,
		MaxMissesBeforeBid: cfg.MaxMissesBeforeBid,
		TickInterval:       cfg.EngineTick,
		Instance:           cfg.Instance,
	})

	go pub.Run(ctx)
	go hub.Run(ctx)
	go svc.Run(ctx)
	go svc.FlushPositions(ctx, cfg.PositionFlush, cfg.TrackRetention)
	go webhooks.New(st, cfg.Instance).Run(ctx)
	if cfg.SimDrivers {
		go sim.New(st, svc, sim.Config{
			Tick: time.Second, SpeedFactor: cfg.SimSpeedFactor, AppBookingsEvery: cfg.SimAppBookings,
			AcceptProb: 0.72, NoShowProb: 0.03, Instance: cfg.Instance,
		}).Run(ctx)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(cfg, st, svc, hub, pub, reseed).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errs := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", cfg.Addr, "instance", cfg.Instance, "auth_required", cfg.AuthRequired, "simulated_drivers", cfg.SimDrivers)
		errs <- srv.ListenAndServe()
	}()
	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}
