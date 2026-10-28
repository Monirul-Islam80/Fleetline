// Package db opens Postgres and applies the embedded migrations in order.
package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver
	"github.com/jmoiron/sqlx"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Open connects with a small retry loop, so the server can start alongside the database in compose.
func Open(ctx context.Context, url string) (*sqlx.DB, error) {
	var lastErr error
	for attempt := 0; attempt < 20; attempt++ {
		conn, err := sqlx.Open("pgx", url)
		if err == nil {
			if err = conn.PingContext(ctx); err == nil {
				conn.SetMaxOpenConns(25)
				conn.SetMaxIdleConns(10)
				conn.SetConnMaxLifetime(30 * time.Minute)
				return conn, nil
			}
			conn.Close()
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return nil, fmt.Errorf("connect to postgres: %w", lastErr)
}

// Migrate runs every migration file not yet recorded in schema_migrations, each in its own transaction.
func Migrate(ctx context.Context, conn *sqlx.DB) error {
	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := conn.GetContext(ctx, &done, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)`, name); err != nil {
			return err
		}
		if done {
			continue
		}
		body, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		tx, err := conn.BeginTxx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
