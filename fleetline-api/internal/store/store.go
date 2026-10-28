// Package store is the only code that writes SQL. Handlers and the engine call these methods,
// passing either the pool or a transaction as the Querier.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/live"
)

// ErrNotFound is returned when a row does not exist. Handlers map it to 404.
var ErrNotFound = errors.New("not found")

// Querier is satisfied by both *sqlx.DB and *sqlx.Tx.
type Querier interface {
	sqlx.ExtContext
}

type Store struct {
	DB   *sqlx.DB
	Live *live.Live
}

func New(db *sqlx.DB, l *live.Live) *Store { return &Store{DB: db, Live: l} }

// Tx runs fn in a transaction, committing on nil and rolling back on error or panic.
func (s *Store) Tx(ctx context.Context, fn func(tx *sqlx.Tx) error) (err error) {
	tx, err := s.DB.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		}
		if err != nil {
			tx.Rollback()
			return
		}
		err = tx.Commit()
	}()
	return fn(tx)
}

func notFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// docs decodes a list of jsonb documents into T.
func docs[T any](ctx context.Context, q Querier, query string, args ...any) ([]T, error) {
	var raw [][]byte
	if err := sqlx.SelectContext(ctx, q, &raw, query, args...); err != nil {
		return nil, err
	}
	out := make([]T, 0, len(raw))
	for _, r := range raw {
		var v T
		if err := json.Unmarshal(r, &v); err != nil {
			return nil, fmt.Errorf("decode %T: %w", v, err)
		}
		out = append(out, v)
	}
	return out, nil
}

// doc decodes one jsonb document.
func doc[T any](ctx context.Context, q Querier, query string, args ...any) (T, error) {
	var v T
	var raw []byte
	if err := sqlx.GetContext(ctx, q, &raw, query, args...); err != nil {
		return v, notFound(err)
	}
	return v, json.Unmarshal(raw, &v)
}

func mustJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return raw
}
