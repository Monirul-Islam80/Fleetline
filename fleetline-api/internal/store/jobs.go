package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
)

func (s *Store) Job(ctx context.Context, q Querier, id string) (domain.Job, error) {
	job, err := doc[domain.Job](ctx, q, `SELECT doc FROM jobs WHERE id = $1`, id)
	job.Normalize()
	return job, err
}

// JobForUpdate locks the row until the transaction ends, so the engine and operators never overwrite each other.
func (s *Store) JobForUpdate(ctx context.Context, tx *sqlx.Tx, id string) (domain.Job, error) {
	job, err := doc[domain.Job](ctx, tx, `SELECT doc FROM jobs WHERE id = $1 FOR UPDATE`, id)
	job.Normalize()
	return job, err
}

// JobByRef accepts a job id or a job number.
func (s *Store) JobByRef(ctx context.Context, q Querier, ref string) (domain.Job, error) {
	job, err := doc[domain.Job](ctx, q, `SELECT doc FROM jobs WHERE id = $1 OR number::text = $1 LIMIT 1`, ref)
	job.Normalize()
	return job, err
}

// Jobs returns jobs matching a WHERE clause (written by this package's callers with $n args).
func (s *Store) Jobs(ctx context.Context, q Querier, where string, args ...any) ([]domain.Job, error) {
	if where == "" {
		where = "true"
	}
	list, err := docs[domain.Job](ctx, q, `SELECT doc FROM jobs WHERE `+where+` ORDER BY pickup_at`, args...)
	for i := range list {
		list[i].Normalize()
	}
	return list, err
}

func (s *Store) NextJobNumber(ctx context.Context, q Querier) (int64, error) {
	var n int64
	err := sqlx.GetContext(ctx, q, &n, `SELECT nextval('job_number_seq')`)
	return n, err
}

// PeekJobNumber is the number the next booking will get, for the console's counter.
func (s *Store) PeekJobNumber(ctx context.Context) int64 {
	var n int64
	_ = s.DB.GetContext(ctx, &n, `SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM job_number_seq`)
	return n
}

// SaveJob inserts or replaces a job, keeping the indexed columns in step with the document.
func (s *Store) SaveJob(ctx context.Context, q Querier, j domain.Job) error {
	j.Normalize()
	_, err := q.ExecContext(ctx, `
		INSERT INTO jobs (id, number, status, pickup_at, site_id, source, driver_id, created_at, updated_at, pickup_geom, doc)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($10,$11),4326)::geography, $12)
		ON CONFLICT (id) DO UPDATE SET status=$3, pickup_at=$4, site_id=$5, source=$6, driver_id=$7,
			updated_at=$9, pickup_geom=EXCLUDED.pickup_geom, doc=$12`,
		j.ID, j.Number, j.Status, j.PickupAt, j.SiteID, j.Source, j.DriverID, j.CreatedAt, j.UpdatedAt,
		j.Pickup.Lng, j.Pickup.Lat, mustJSON(j))
	return err
}

func (s *Store) DeleteJob(ctx context.Context, q Querier, id string) error {
	res, err := q.ExecContext(ctx, `DELETE FROM jobs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) AddEvent(ctx context.Context, q Querier, e domain.JobEvent) error {
	_, err := q.ExecContext(ctx, `INSERT INTO job_events (id, job_id, type, at, text) VALUES ($1,$2,$3,$4,$5)`, e.ID, e.JobID, e.Type, e.At, e.Text)
	return err
}

func (s *Store) Events(ctx context.Context, jobID string) ([]domain.JobEvent, error) {
	out := []domain.JobEvent{}
	err := s.DB.SelectContext(ctx, &out, `SELECT id, job_id AS "jobid", type, at, text FROM job_events WHERE job_id = $1 ORDER BY at`, jobID)
	return out, err
}

// BookingFilter is BookingQuery from the console, already turned into a time window.
type BookingFilter struct {
	From, To                                domain.Millis
	SiteID, Source, Status                  string
	JobNumber, Driver, Address, Destination string
	CustomerName, CustomerPhone, Account    string
	Keyword                                 string
	Statuses                                []string
	Page, PageSize                          int
	NewestFirst                             bool
}

// SearchBookings filters in SQL and pages the result. Text filters are case-insensitive contains, as in the console.
func (s *Store) SearchBookings(ctx context.Context, f BookingFilter) (domain.Page[domain.Job], error) {
	var where []string
	var args []any
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	like := func(expr, value string) {
		if value != "" {
			where = append(where, fmt.Sprintf("%s ILIKE %s", expr, arg("%"+value+"%")))
		}
	}
	where = append(where, "pickup_at BETWEEN "+arg(f.From)+" AND "+arg(f.To))
	if f.SiteID != "" && f.SiteID != "ALL" {
		where = append(where, "site_id = "+arg(f.SiteID))
	}
	if f.Source != "" && f.Source != "ALL" {
		where = append(where, "source = "+arg(f.Source))
	}
	if f.Status != "" && f.Status != "ALL" {
		where = append(where, "status = "+arg(f.Status))
	}
	if len(f.Statuses) > 0 {
		where = append(where, "status = ANY("+arg(f.Statuses)+")")
	}
	like("number::text", f.JobNumber)
	if f.Driver != "" {
		where = append(where, "driver_id IN (SELECT id FROM drivers WHERE callsign ILIKE "+arg("%"+f.Driver+"%")+")")
	}
	like("(doc->'pickup'->>'label') || ' ' || (doc->'pickup'->>'area') || ' ' || (doc->'pickup'->>'postcode')", f.Address)
	like("coalesce(doc->'dropoff'->>'label','') || ' ' || coalesce(doc->'dropoff'->>'area','')", f.Destination)
	like("doc->>'customerName'", f.CustomerName)
	if d := fleet.Digits(f.CustomerPhone); d != "" {
		like("regexp_replace(doc->>'phone','\\D','','g')", d)
	}
	like("coalesce(doc->>'accountCode','')", f.Account)
	like("(doc->>'instructions') || ' ' || (doc->>'operatorNotes') || ' ' || (doc->>'customerNotes')", f.Keyword)

	clause := strings.Join(where, " AND ")
	page := domain.Page[domain.Job]{Page: max(f.Page, 1), PageSize: f.PageSize}
	if page.PageSize <= 0 || page.PageSize > 500 {
		page.PageSize = 50
	}
	if err := sqlx.GetContext(ctx, s.DB, &page.Total, `SELECT count(*) FROM jobs WHERE `+clause, args...); err != nil {
		return page, err
	}
	order := "pickup_at DESC"
	if !f.NewestFirst {
		order = "pickup_at ASC"
	}
	items, err := docs[domain.Job](ctx, s.DB, fmt.Sprintf(`SELECT doc FROM jobs WHERE %s ORDER BY %s LIMIT %d OFFSET %d`,
		clause, order, page.PageSize, (page.Page-1)*page.PageSize), args...)
	for i := range items {
		items[i].Normalize()
	}
	page.Items = items
	return page, err
}

// NearbyJobs lists unassigned jobs within radius of a point, nearest first (PostGIS).
func (s *Store) NearbyJobs(ctx context.Context, p domain.LatLng, radiusM float64, limit int) ([]domain.Job, error) {
	list, err := docs[domain.Job](ctx, s.DB, `
		SELECT doc FROM jobs
		WHERE status = ANY($4) AND ST_DWithin(pickup_geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
		ORDER BY pickup_geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography LIMIT $5`,
		p.Lng, p.Lat, radiusM, []string{domain.JobNew, domain.JobBidding, domain.JobBooked}, limit)
	for i := range list {
		list[i].Normalize()
	}
	return list, err
}
