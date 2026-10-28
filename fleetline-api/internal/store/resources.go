package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/fleet"
)

// Resource is a row in the generic table: any JSON object, grouped by kind and optionally by a parent.
// The object returned to clients is `data` plus id, parentId, createdAt and updatedAt.
type Resource map[string]any

type resourceRow struct {
	ID        string `db:"id"`
	ParentID  string `db:"parent_id"`
	Data      []byte `db:"data"`
	CreatedAt int64  `db:"created_at"`
	UpdatedAt int64  `db:"updated_at"`
}

func (r resourceRow) toResource() Resource {
	out := Resource{}
	_ = json.Unmarshal(r.Data, &out)
	out["id"] = r.ID
	if r.ParentID != "" {
		out["parentId"] = r.ParentID
	}
	out["createdAt"] = r.CreatedAt
	out["updatedAt"] = r.UpdatedAt
	return out
}

// strip removes the fields the table owns, so a client cannot overwrite them through the body.
func strip(data map[string]any) []byte {
	clean := map[string]any{}
	for k, v := range data {
		switch k {
		case "id", "parentId", "createdAt", "updatedAt":
		default:
			clean[k] = v
		}
	}
	raw, _ := json.Marshal(clean)
	return raw
}

type ResourceQuery struct {
	ParentID string // "" means any parent
	Search   string // matched against the whole JSON text
	Where    map[string]string
	Limit    int
	Offset   int
}

func (s *Store) ListResources(ctx context.Context, kind string, q ResourceQuery) ([]Resource, int, error) {
	where := "kind = $1"
	args := []any{kind}
	if q.ParentID != "" {
		args = append(args, q.ParentID)
		where += fmt.Sprintf(" AND parent_id = $%d", len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+q.Search+"%")
		where += fmt.Sprintf(" AND data::text ILIKE $%d", len(args))
	}
	for field, value := range q.Where {
		args = append(args, field, value)
		where += fmt.Sprintf(" AND data->>$%d = $%d", len(args)-1, len(args))
	}
	var total int
	if err := s.DB.GetContext(ctx, &total, `SELECT count(*) FROM resources WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	if q.Limit <= 0 || q.Limit > 500 {
		q.Limit = 100
	}
	rows := []resourceRow{}
	err := s.DB.SelectContext(ctx, &rows, fmt.Sprintf(`SELECT id, parent_id, data, created_at, updated_at FROM resources
		WHERE %s ORDER BY created_at, id LIMIT %d OFFSET %d`, where, q.Limit, q.Offset), args...)
	out := make([]Resource, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.toResource())
	}
	return out, total, err
}

func (s *Store) GetResource(ctx context.Context, kind, id string) (Resource, error) {
	var r resourceRow
	err := s.DB.GetContext(ctx, &r, `SELECT id, parent_id, data, created_at, updated_at FROM resources WHERE kind = $1 AND id = $2`, kind, id)
	if err != nil {
		return nil, notFound(err)
	}
	return r.toResource(), nil
}

// CreateResource stores a new object. An "id" in data is kept (useful for natural keys), otherwise one is generated.
func (s *Store) CreateResource(ctx context.Context, q Querier, kind, parentID string, data map[string]any) (Resource, error) {
	id, _ := data["id"].(string)
	if id == "" {
		id = fleet.NewID(kind)
	}
	now := fleet.NowMillis()
	var r resourceRow
	err := sqlx.GetContext(ctx, q, &r, `
		INSERT INTO resources (kind, id, parent_id, data, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)
		ON CONFLICT (kind, id) DO UPDATE SET data = resources.data || EXCLUDED.data, updated_at = EXCLUDED.updated_at
		RETURNING id, parent_id, data, created_at, updated_at`, kind, id, parentID, strip(data), now)
	if err != nil {
		return nil, err
	}
	return r.toResource(), nil
}

// UpdateResource merges fields into an existing object (PATCH semantics).
func (s *Store) UpdateResource(ctx context.Context, kind, id string, data map[string]any) (Resource, error) {
	var r resourceRow
	err := s.DB.GetContext(ctx, &r, `
		UPDATE resources SET data = data || $3, updated_at = $4 WHERE kind = $1 AND id = $2
		RETURNING id, parent_id, data, created_at, updated_at`, kind, id, strip(data), fleet.NowMillis())
	if err != nil {
		return nil, notFound(err)
	}
	return r.toResource(), nil
}

func (s *Store) DeleteResource(ctx context.Context, kind, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM resources WHERE kind = $1 AND id = $2`, kind, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteResources removes every object of a kind under a parent ("" removes them all).
func (s *Store) DeleteResources(ctx context.Context, kind, parentID string) (int64, error) {
	query := `DELETE FROM resources WHERE kind = $1`
	args := []any{kind}
	if parentID != "" {
		query += ` AND parent_id = $2`
		args = append(args, parentID)
	}
	res, err := s.DB.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
