// Package config reads settings from the environment. Every setting has a default that works for local runs.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr           string   // HTTP listen address
	DatabaseURL    string   // Postgres with PostGIS
	RedisURL       string   // Redis for GPS, locks, leader lease and Pub/Sub
	AllowedOrigins []string // browser origins allowed to call the API and open the socket
	FleetTimeZone  string   // operators type times in this zone
	Instance       string   // unique per server process, for leader election
	OperatorName   string   // createdBy for console bookings when no X-Operator header is sent

	OfferTimeout       time.Duration // driver has this long to accept an offer
	MaxMissesBeforeBid int
	EngineTick         time.Duration
	PublishInterval    time.Duration // how often merged changes go out to consoles
	PositionFlush      time.Duration // Redis GPS to PostGIS
	TrackRetention     time.Duration

	SeedOnEmpty    bool // load the demo fleet when the database is empty
	SimDrivers     bool // simulate the seeded drivers
	SimSpeedFactor float64
	SimAppBookings time.Duration // 0 disables the passenger-app demo feed

	AuthRequired  bool // when false (demo), console endpoints accept requests without credentials
	APIKeys       []string
	TokenSecret   string
	WebhookSecret string // shared secret for telephony webhooks; empty accepts any caller (local only)
	DriverPIN     string // demo driver login PIN until real credentials exist
	UserCode      string // demo passenger login code until SMS verification exists
}

func Load() Config {
	host, _ := os.Hostname()
	return Config{
		Addr:           env("ADDR", ":8080"),
		DatabaseURL:    env("DATABASE_URL", "postgres://fleet:fleet@localhost:5432/fleet?sslmode=disable"),
		RedisURL:       env("REDIS_URL", "redis://localhost:6379/0"),
		AllowedOrigins: list("ALLOWED_ORIGINS", "http://localhost:3000"),
		FleetTimeZone:  env("FLEET_TIME_ZONE", "Europe/London"),
		Instance:       env("INSTANCE_ID", host+"-"+strconv.Itoa(os.Getpid())),
		OperatorName:   env("OPERATOR_NAME", "Demo Operator"),

		OfferTimeout:       dur("OFFER_TIMEOUT", 15*time.Second),
		MaxMissesBeforeBid: num("MAX_MISSES_BEFORE_BID", 3),
		EngineTick:         dur("ENGINE_TICK", time.Second),
		PublishInterval:    dur("PUBLISH_INTERVAL", 250*time.Millisecond),
		PositionFlush:      dur("POSITION_FLUSH", 2*time.Second),
		TrackRetention:     dur("TRACK_RETENTION", 72*time.Hour),

		SeedOnEmpty:    flag("SEED_ON_EMPTY", true),
		SimDrivers:     flag("SIM_DRIVERS", true),
		SimSpeedFactor: float("SIM_SPEED_FACTOR", 8),
		SimAppBookings: dur("SIM_APP_BOOKINGS_EVERY", 40*time.Second),

		AuthRequired:  flag("AUTH_REQUIRED", false),
		APIKeys:       list("API_KEYS", ""),
		TokenSecret:   env("TOKEN_SECRET", "change-me-in-production"),
		WebhookSecret: env("WEBHOOK_SECRET", ""),
		DriverPIN:     env("DEMO_DRIVER_PIN", "0000"),
		UserCode:      env("DEMO_USER_CODE", "1234"),
	}
}

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func list(key, def string) []string {
	out := []string{}
	for _, v := range strings.Split(env(key, def), ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func flag(key string, def bool) bool {
	v, err := strconv.ParseBool(env(key, strconv.FormatBool(def)))
	if err != nil {
		return def
	}
	return v
}

func num(key string, def int) int {
	v, err := strconv.Atoi(env(key, strconv.Itoa(def)))
	if err != nil {
		return def
	}
	return v
}

func float(key string, def float64) float64 {
	v, err := strconv.ParseFloat(env(key, ""), 64)
	if err != nil {
		return def
	}
	return v
}

func dur(key string, def time.Duration) time.Duration {
	v, err := time.ParseDuration(env(key, def.String()))
	if err != nil {
		return def
	}
	return v
}
