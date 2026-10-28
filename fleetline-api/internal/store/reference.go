package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
)

/* ---------- Zones (PostGIS polygons) ---------- */

const zoneSelect = `SELECT id, name, tag, radius_m AS radiusm, surge, fully_booked AS fullybooked,
	ST_Y(centre::geometry) AS lat, ST_X(centre::geometry) AS lng FROM zones`

func (s *Store) Zones(ctx context.Context) ([]domain.Zone, error) {
	out := []domain.Zone{}
	err := s.DB.SelectContext(ctx, &out, zoneSelect+` ORDER BY name`)
	return out, err
}

func (s *Store) Zone(ctx context.Context, id string) (domain.Zone, error) {
	var z domain.Zone
	err := s.DB.GetContext(ctx, &z, zoneSelect+` WHERE id = $1`, id)
	return z, notFound(err)
}

// SaveZone stores a zone. Without an explicit polygon the area is a circle of radiusM around the centre.
func (s *Store) SaveZone(ctx context.Context, q Querier, z domain.Zone) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO zones (id, name, tag, radius_m, centre, area, surge, fully_booked)
		VALUES ($1,$2,$3,$4::integer, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,
			ST_Buffer(ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, $4::float8, 32)::geography(Polygon,4326), $7, $8)
		ON CONFLICT (id) DO UPDATE SET name=$2, tag=$3, radius_m=$4::integer, centre=EXCLUDED.centre, area=EXCLUDED.area, surge=$7, fully_booked=$8`,
		z.ID, z.Name, z.Tag, z.RadiusM, z.Lng, z.Lat, z.Surge, z.FullyBooked)
	return err
}

// ZoneAt is point-in-polygon: the smallest zone containing the point, else the nearest zone within 5 km.
func (s *Store) ZoneAt(ctx context.Context, q Querier, p domain.LatLng) (*domain.Zone, error) {
	var z domain.Zone
	err := sqlx.GetContext(ctx, q, &z, zoneSelect+`
		WHERE ST_Covers(area, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)
		ORDER BY ST_Area(area) LIMIT 1`, p.Lng, p.Lat)
	if err == nil {
		return &z, nil
	}
	err = sqlx.GetContext(ctx, q, &z, zoneSelect+`
		WHERE ST_DWithin(area, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 5000)
		ORDER BY area <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography LIMIT 1`, p.Lng, p.Lat)
	if err != nil {
		return nil, notFound(err)
	}
	return &z, nil
}

func (s *Store) ZoneName(ctx context.Context, id *string) string {
	if id == nil {
		return "Out of area"
	}
	var name string
	if err := s.DB.GetContext(ctx, &name, `SELECT name FROM zones WHERE id = $1`, *id); err != nil {
		return "Out of area"
	}
	return name
}

// SetZoneFlags updates surge and fully-booked flags. Nil leaves a flag unchanged; ids nil means every zone.
func (s *Store) SetZoneFlags(ctx context.Context, ids []string, surge, fullyBooked *bool) error {
	sets := []string{}
	args := []any{}
	if surge != nil {
		args = append(args, *surge)
		sets = append(sets, fmt.Sprintf("surge = $%d", len(args)))
	}
	if fullyBooked != nil {
		args = append(args, *fullyBooked)
		sets = append(sets, fmt.Sprintf("fully_booked = $%d", len(args)))
	}
	if len(sets) == 0 {
		return nil
	}
	query := `UPDATE zones SET ` + strings.Join(sets, ", ")
	if ids != nil {
		args = append(args, ids)
		query += fmt.Sprintf(" WHERE id = ANY($%d)", len(args))
	}
	_, err := s.DB.ExecContext(ctx, query, args...)
	return err
}

/* ---------- Places (address search) ---------- */

const placeSelect = `SELECT id, label, area, postcode, coalesce(zone_id,'') AS zoneid,
	ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM places`

// SearchPlaces matches every typed word against label, area and postcode, ranking label prefix matches first.
func (s *Store) SearchPlaces(ctx context.Context, query string, limit int) ([]domain.Place, error) {
	words := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool { return r == ' ' || r == ',' })
	out := []domain.Place{}
	if len(words) == 0 {
		return out, nil
	}
	var where []string
	args := []any{strings.ToLower(strings.TrimSpace(query)), words[0]}
	for _, w := range words {
		args = append(args, "%"+w+"%")
		where = append(where, fmt.Sprintf("search LIKE $%d", len(args)))
	}
	args = append(args, limit)
	err := s.DB.SelectContext(ctx, &out, fmt.Sprintf(`%s WHERE %s
		ORDER BY (CASE WHEN lower(label) LIKE $1 || '%%' THEN 100 ELSE 0 END)
		       + (CASE WHEN lower(label) LIKE $2 || '%%' THEN 10 ELSE 0 END) DESC, label
		LIMIT $%d`, placeSelect, strings.Join(where, " AND "), len(args)), args...)
	return out, err
}

func (s *Store) Place(ctx context.Context, id string) (domain.Place, error) {
	var p domain.Place
	err := s.DB.GetContext(ctx, &p, placeSelect+` WHERE id = $1`, id)
	return p, notFound(err)
}

func (s *Store) SavePlace(ctx context.Context, q Querier, p domain.Place) error {
	var zone any
	if p.ZoneID != "" {
		zone = p.ZoneID
	}
	_, err := q.ExecContext(ctx, `
		INSERT INTO places (id, label, area, postcode, zone_id, geom)
		VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326)::geography)
		ON CONFLICT (id) DO UPDATE SET label=$2, area=$3, postcode=$4, zone_id=$5, geom=EXCLUDED.geom`,
		p.ID, p.Label, p.Area, p.Postcode, zone, p.Lng, p.Lat)
	return err
}

/* ---------- Sites ---------- */

func (s *Store) Sites(ctx context.Context) ([]domain.Site, error) {
	out := []domain.Site{}
	err := s.DB.SelectContext(ctx, &out, `SELECT id, name FROM sites ORDER BY name`)
	return out, err
}

func (s *Store) SaveSite(ctx context.Context, q Querier, site domain.Site) error {
	_, err := q.ExecContext(ctx, `INSERT INTO sites (id, name) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET name=$2`, site.ID, site.Name)
	return err
}

/* ---------- Customers (the "users" group) ---------- */

func (s *Store) Customers(ctx context.Context, q Querier, where string, args ...any) ([]domain.Customer, error) {
	if where == "" {
		where = "true"
	}
	return docs[domain.Customer](ctx, q, `SELECT doc FROM customers WHERE `+where+` ORDER BY doc->>'name'`, args...)
}

func (s *Store) Customer(ctx context.Context, id string) (domain.Customer, error) {
	return doc[domain.Customer](ctx, s.DB, `SELECT doc FROM customers WHERE id = $1`, id)
}

// CustomerByPhone matches the way caller ID does: either number may carry a prefix the other lacks.
func (s *Store) CustomerByPhone(ctx context.Context, phone string) (*domain.Customer, error) {
	digits := fleet.Digits(phone)
	if len(digits) < 7 {
		return nil, nil
	}
	list, err := docs[domain.Customer](ctx, s.DB, `
		SELECT doc FROM customers
		WHERE right(phone_digits, 10) = right($1, 10) OR phone_digits LIKE '%' || $1 OR $1 LIKE '%' || phone_digits
		LIMIT 1`, digits)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

func (s *Store) SaveCustomer(ctx context.Context, q Querier, c domain.Customer) error {
	if c.RecentPlaceIDs == nil {
		c.RecentPlaceIDs = []string{}
	}
	_, err := q.ExecContext(ctx, `
		INSERT INTO customers (id, phone_digits, doc) VALUES ($1,$2,$3)
		ON CONFLICT (id) DO UPDATE SET phone_digits=$2, doc=$3`, c.ID, fleet.Digits(c.Phone), mustJSON(c))
	return err
}
