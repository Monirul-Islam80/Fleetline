package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
)

// Inbox kinds: the console's counter tabs, plus broadcast messages to drivers.
const (
	KindOperator     = "operator"
	KindStaffMessage = "staff_message"
	KindDriverChat   = "driver_chat"
	KindCallQueue    = "call_queue"
	KindAlert        = "alert"
	KindFlight       = "flight"
	KindBroadcast    = "broadcast"
	KindCall         = "call" // telephony log
)

// InboxList returns one kind, newest first.
func InboxList[T any](ctx context.Context, s *Store, kind string, limit int) ([]T, error) {
	return docs[T](ctx, s.DB, `SELECT doc FROM inbox WHERE kind = $1 ORDER BY at DESC LIMIT $2`, kind, limit)
}

func InboxGet[T any](ctx context.Context, s *Store, kind, id string) (T, error) {
	return doc[T](ctx, s.DB, `SELECT doc FROM inbox WHERE kind = $1 AND id = $2`, kind, id)
}

func (s *Store) InboxPut(ctx context.Context, q Querier, kind, id string, at domain.Millis, v any) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO inbox (kind, id, at, doc) VALUES ($1,$2,$3,$4)
		ON CONFLICT (kind, id) DO UPDATE SET at=$3, doc=$4`, kind, id, at, mustJSON(v))
	return err
}

// InboxPatch merges fields into a stored item.
func (s *Store) InboxPatch(ctx context.Context, kind, id string, fields map[string]any) error {
	raw, _ := json.Marshal(fields)
	res, err := s.DB.ExecContext(ctx, `UPDATE inbox SET doc = doc || $3 WHERE kind = $1 AND id = $2`, kind, id, raw)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) InboxDelete(ctx context.Context, kind, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM inbox WHERE kind = $1 AND id = $2`, kind, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// LoadInbox returns everything the console's counter tabs show on load.
func (s *Store) LoadInbox(ctx context.Context) (domain.Inbox, error) {
	var in domain.Inbox
	var err error
	if in.Operators, err = InboxList[domain.Operator](ctx, s, KindOperator, 100); err != nil {
		return in, err
	}
	if in.StaffMessages, err = InboxList[domain.StaffMessage](ctx, s, KindStaffMessage, 200); err != nil {
		return in, err
	}
	if in.DriverChats, err = InboxList[domain.DriverChat](ctx, s, KindDriverChat, 200); err != nil {
		return in, err
	}
	if in.CallQueue, err = InboxList[domain.CallRequest](ctx, s, KindCallQueue, 200); err != nil {
		return in, err
	}
	if in.Alerts, err = InboxList[domain.Alert](ctx, s, KindAlert, 200); err != nil {
		return in, err
	}
	in.Flights, err = InboxList[domain.Flight](ctx, s, KindFlight, 100)
	// Operators keep their seeded order; the others are newest first.
	for i, j := 0, len(in.Operators)-1; i < j; i, j = i+1, j-1 {
		in.Operators[i], in.Operators[j] = in.Operators[j], in.Operators[i]
	}
	return in, err
}

/* ---------- Logs ---------- */

// LogFilter is LogQuery from the console.
type LogFilter struct {
	From, To                                           domain.Millis
	Driver, Vehicle, Zone, JobNumber, Operator, Action string
	Categories                                         []string
	OldestFirst                                        bool
}

// eventCategory matches EVENT_CATEGORY in the console's mock API.
const eventCategory = `CASE e.type
	WHEN 'CREATED' THEN 'OPERATOR' WHEN 'PAUSED' THEN 'OPERATOR' WHEN 'RESUMED' THEN 'OPERATOR'
	WHEN 'CANCELLED' THEN 'OPERATOR' WHEN 'ASSIGNED' THEN 'OPERATOR' WHEN 'OFFERED' THEN 'SYSTEM'
	ELSE 'DRIVER' END`

// Logs builds the activity log from job events (every booking writes a CREATED event).
func (s *Store) Logs(ctx context.Context, f LogFilter) ([]domain.LogEntry, error) {
	order := "DESC"
	if f.OldestFirst {
		order = "ASC"
	}
	query := fmt.Sprintf(`
		WITH l AS (
			SELECT e.id, e.at, %s AS category,
				coalesce(d.callsign, '') AS driver,
				coalesce(d.doc->>'plate', '') AS vehicle,
				coalesce(z.name, 'Out of area') AS zone,
				j.number::text AS jobnumber,
				CASE WHEN %s = 'OPERATOR' THEN j.doc->>'createdBy' ELSE '' END AS operator,
				e.type AS action, e.text
			FROM job_events e
			JOIN jobs j ON j.id = e.job_id
			LEFT JOIN drivers d ON d.id = j.driver_id
			LEFT JOIN zones z ON z.id = j.doc->'pickup'->>'zoneId'
			WHERE e.at BETWEEN $1 AND $2
		)
		SELECT * FROM l
		WHERE category = ANY($3)
		  AND driver ILIKE $4 AND vehicle ILIKE $5 AND zone ILIKE $6 AND jobnumber ILIKE $7
		  AND operator ILIKE $8 AND action ILIKE $9
		ORDER BY at %s LIMIT 500`, eventCategory, eventCategory, order)
	contains := func(v string) string { return "%" + strings.TrimSpace(v) + "%" }
	out := []domain.LogEntry{}
	err := sqlx.SelectContext(ctx, s.DB, &out, query, f.From, f.To, f.Categories,
		contains(f.Driver), contains(f.Vehicle), contains(f.Zone), contains(f.JobNumber), contains(f.Operator), contains(f.Action))
	return out, err
}
