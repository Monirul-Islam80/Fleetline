package store

import (
	"context"
	"strings"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/live"
)

// overlay replaces stored coordinates with the latest Redis ping, which is fresher than Postgres.
func overlay(d *domain.Driver, positions map[string]live.Position) {
	if p, ok := positions[d.ID]; ok {
		d.Lat, d.Lng = p.Lat, p.Lng
	}
}

func (s *Store) positions(ctx context.Context) map[string]live.Position {
	if s.Live == nil {
		return nil
	}
	pos, _ := s.Live.All(ctx)
	return pos
}

// Drivers returns drivers matching a WHERE clause, with live positions applied.
func (s *Store) Drivers(ctx context.Context, q Querier, where string, args ...any) ([]domain.Driver, error) {
	if where == "" {
		where = "true"
	}
	list, err := docs[domain.Driver](ctx, q, `SELECT doc FROM drivers WHERE `+where+` ORDER BY length(callsign), callsign`, args...)
	if err != nil {
		return nil, err
	}
	pos := s.positions(ctx)
	for i := range list {
		overlay(&list[i], pos)
	}
	return list, nil
}

func (s *Store) Driver(ctx context.Context, q Querier, id string) (domain.Driver, error) {
	d, err := doc[domain.Driver](ctx, q, `SELECT doc FROM drivers WHERE id = $1`, id)
	if err == nil {
		if p, ok := s.Live.Get(ctx, id); ok {
			d.Lat, d.Lng = p.Lat, p.Lng
		}
	}
	return d, err
}

// DriverByRef finds a driver by id or callsign, the two ways operators and the driver app refer to one.
func (s *Store) DriverByRef(ctx context.Context, q Querier, ref string) (domain.Driver, error) {
	var id string
	if err := sqlx.GetContext(ctx, q, &id, `SELECT id FROM drivers WHERE id = $1 OR callsign = $1 LIMIT 1`, strings.TrimSpace(ref)); err != nil {
		return domain.Driver{}, notFound(err)
	}
	return s.Driver(ctx, q, id)
}

func (s *Store) DriverForUpdate(ctx context.Context, tx *sqlx.Tx, id string) (domain.Driver, error) {
	d, err := doc[domain.Driver](ctx, tx, `SELECT doc FROM drivers WHERE id = $1 FOR UPDATE`, id)
	if err == nil {
		if p, ok := s.Live.Get(ctx, id); ok {
			d.Lat, d.Lng = p.Lat, p.Lng
		}
	}
	return d, err
}

// SaveDriver inserts or replaces a driver. Position columns are updated too, so a status change
// carries the latest coordinates into Postgres.
func (s *Store) SaveDriver(ctx context.Context, q Querier, d domain.Driver) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO drivers (id, callsign, status, seats, site_id, current_job_id, geom, doc)
		VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)::geography, $9)
		ON CONFLICT (id) DO UPDATE SET callsign=$2, status=$3, seats=$4, site_id=$5, current_job_id=$6, geom=EXCLUDED.geom, doc=$9`,
		d.ID, d.Callsign, d.Status, d.Seats, d.SiteID, d.CurrentJobID, d.Lng, d.Lat, mustJSON(d))
	return err
}

func (s *Store) SetDriverActive(ctx context.Context, id string, active bool) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE drivers SET active = $2 WHERE id = $1`, id, active)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// NearestCandidate is a dispatchable driver ranked by distance from a pickup.
type NearestCandidate struct {
	ID       string  `db:"id"`
	Callsign string  `db:"callsign"`
	Metres   float64 `db:"metres"`
}

// NearestDrivers runs the nearest-driver query in PostGIS: free drivers with enough seats, not excluded,
// nearest first. Positions come from the last flush, at most a few seconds old.
func (s *Store) NearestDrivers(ctx context.Context, q Querier, p domain.LatLng, minSeats int, exclude []string, limit int) ([]NearestCandidate, error) {
	if exclude == nil {
		exclude = []string{}
	}
	out := []NearestCandidate{}
	err := sqlx.SelectContext(ctx, q, &out, `
		SELECT id, callsign, ST_Distance(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS metres
		FROM drivers
		WHERE active AND status = ANY($3) AND seats >= $4 AND NOT (callsign = ANY($5))
		ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
		LIMIT $6`,
		p.Lng, p.Lat, []string{domain.DriverAvailable, domain.DriverParked}, minSeats, exclude, limit)
	return out, err
}

// FlushPositions copies buffered Redis positions into Postgres and the playback history, in one statement each.
func (s *Store) FlushPositions(ctx context.Context, batch map[string]live.Position) error {
	if len(batch) == 0 {
		return nil
	}
	ids := make([]string, 0, len(batch))
	lats := make([]float64, 0, len(batch))
	lngs := make([]float64, 0, len(batch))
	ats := make([]int64, 0, len(batch))
	for id, p := range batch {
		ids = append(ids, id)
		lats = append(lats, p.Lat)
		lngs = append(lngs, p.Lng)
		ats = append(ats, p.At)
	}
	return s.Tx(ctx, func(tx *sqlx.Tx) error {
		if _, err := tx.ExecContext(ctx, `
			UPDATE drivers d SET
				geom = ST_SetSRID(ST_MakePoint(v.lng, v.lat),4326)::geography,
				doc = d.doc || jsonb_build_object('lat', v.lat, 'lng', v.lng)
			FROM unnest($1::text[], $2::float8[], $3::float8[]) AS v(id, lat, lng)
			WHERE d.id = v.id`, ids, lats, lngs); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO track_points (driver_id, at, geom)
			SELECT v.id, v.at, ST_SetSRID(ST_MakePoint(v.lng, v.lat),4326)::geography
			FROM unnest($1::text[], $2::float8[], $3::float8[], $4::bigint[]) AS v(id, lat, lng, at)`, ids, lats, lngs, ats)
		return err
	})
}

// Tracks returns GPS history for drivers seen within radius of a point during [from, to].
func (s *Store) Tracks(ctx context.Context, from, to domain.Millis, centre domain.LatLng, radiusM float64) ([]domain.DriverTrack, error) {
	type row struct {
		Callsign string  `db:"callsign"`
		At       int64   `db:"at"`
		Lat      float64 `db:"lat"`
		Lng      float64 `db:"lng"`
	}
	var rows []row
	err := s.DB.SelectContext(ctx, &rows, `
		WITH seen AS (
			SELECT DISTINCT driver_id FROM track_points
			WHERE at BETWEEN $1 AND $2 AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5)
			LIMIT 50
		)
		SELECT d.callsign, t.at, ST_Y(t.geom::geometry) AS lat, ST_X(t.geom::geometry) AS lng
		FROM track_points t JOIN seen USING (driver_id) JOIN drivers d ON d.id = t.driver_id
		WHERE t.at BETWEEN $1 AND $2
		ORDER BY d.callsign, t.at`, from, to, centre.Lng, centre.Lat, radiusM)
	if err != nil {
		return nil, err
	}
	out := []domain.DriverTrack{}
	for _, r := range rows {
		if len(out) == 0 || out[len(out)-1].Callsign != r.Callsign {
			out = append(out, domain.DriverTrack{Callsign: r.Callsign, Points: []domain.TrackPoint{}})
		}
		last := &out[len(out)-1]
		last.Points = append(last.Points, domain.TrackPoint{Lat: r.Lat, Lng: r.Lng, At: r.At})
	}
	return out, nil
}

// PruneTracks keeps playback history to the last `keepMs`.
func (s *Store) PruneTracks(ctx context.Context, before domain.Millis) {
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM track_points WHERE at < $1`, before)
}
