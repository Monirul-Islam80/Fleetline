// Package live keeps the fast-changing state in Redis: driver GPS from 5-second pings, and
// edit locks on bookings. Postgres gets positions in batches from Flush, not on every ping.
package live

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	posKey   = "fleet:pos"     // hash: driverId -> "lat,lng,atMillis"
	geoKey   = "fleet:geo"     // geo set for radius queries straight from Redis
	dirtyKey = "fleet:pos:new" // set of driver ids pinged since the last flush
	lockPfx  = "fleet:lock:"
)

type Position struct {
	Lat float64
	Lng float64
	At  int64
}

type Live struct {
	rdb *redis.Client
}

func New(rdb *redis.Client) *Live { return &Live{rdb: rdb} }

func (l *Live) Redis() *redis.Client { return l.rdb }

// Ping stores a driver's latest position.
func (l *Live) Ping(ctx context.Context, driverID string, p Position) error {
	_, err := l.rdb.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.HSet(ctx, posKey, driverID, fmt.Sprintf("%.6f,%.6f,%d", p.Lat, p.Lng, p.At))
		pipe.GeoAdd(ctx, geoKey, &redis.GeoLocation{Name: driverID, Longitude: p.Lng, Latitude: p.Lat})
		pipe.SAdd(ctx, dirtyKey, driverID)
		return nil
	})
	return err
}

func parse(raw string) (Position, bool) {
	parts := strings.Split(raw, ",")
	if len(parts) != 3 {
		return Position{}, false
	}
	lat, err1 := strconv.ParseFloat(parts[0], 64)
	lng, err2 := strconv.ParseFloat(parts[1], 64)
	at, err3 := strconv.ParseInt(parts[2], 10, 64)
	return Position{Lat: lat, Lng: lng, At: at}, err1 == nil && err2 == nil && err3 == nil
}

// All returns every known position, keyed by driver id.
func (l *Live) All(ctx context.Context) (map[string]Position, error) {
	raw, err := l.rdb.HGetAll(ctx, posKey).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[string]Position, len(raw))
	for id, v := range raw {
		if p, ok := parse(v); ok {
			out[id] = p
		}
	}
	return out, nil
}

func (l *Live) Get(ctx context.Context, driverID string) (Position, bool) {
	raw, err := l.rdb.HGet(ctx, posKey, driverID).Result()
	if err != nil {
		return Position{}, false
	}
	return parse(raw)
}

// TakeDirty returns positions pinged since the last call and clears the list.
func (l *Live) TakeDirty(ctx context.Context) (map[string]Position, error) {
	tmp := dirtyKey + ":flush"
	if err := l.rdb.Rename(ctx, dirtyKey, tmp).Err(); err != nil {
		if strings.Contains(err.Error(), "no such key") {
			return map[string]Position{}, nil
		}
		return nil, err
	}
	ids, err := l.rdb.SMembers(ctx, tmp).Result()
	l.rdb.Del(ctx, tmp)
	if err != nil || len(ids) == 0 {
		return map[string]Position{}, err
	}
	vals, err := l.rdb.HMGet(ctx, posKey, ids...).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[string]Position, len(ids))
	for i, v := range vals {
		if s, ok := v.(string); ok {
			if p, ok := parse(s); ok {
				out[ids[i]] = p
			}
		}
	}
	return out, nil
}

// Forget removes a driver's position (logout, deactivation).
func (l *Live) Forget(ctx context.Context, driverID string) {
	l.rdb.HDel(ctx, posKey, driverID)
	l.rdb.ZRem(ctx, geoKey, driverID)
}

// Reset clears all positions, used when the demo data is reseeded.
func (l *Live) Reset(ctx context.Context) {
	l.rdb.Del(ctx, posKey, geoKey, dirtyKey)
}

/* ---------- Edit locks ---------- */

var ErrLocked = errors.New("locked by another operator")

// Lock takes or renews a lock. It fails if someone else holds it.
func (l *Live) Lock(ctx context.Context, key, owner string, ttl time.Duration) (string, error) {
	k := lockPfx + key
	ok, err := l.rdb.SetNX(ctx, k, owner, ttl).Result()
	if err != nil {
		return "", err
	}
	if ok {
		return owner, nil
	}
	current, err := l.rdb.Get(ctx, k).Result()
	if err != nil {
		return "", err
	}
	if current == owner {
		l.rdb.PExpire(ctx, k, ttl)
		return owner, nil
	}
	return current, ErrLocked
}

// Unlock releases a lock only if `owner` holds it.
func (l *Live) Unlock(ctx context.Context, key, owner string) error {
	const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`
	return l.rdb.Eval(ctx, script, []string{lockPfx + key}, owner).Err()
}

// LockOwner returns who holds a lock, or "".
func (l *Live) LockOwner(ctx context.Context, key string) string {
	owner, _ := l.rdb.Get(ctx, lockPfx+key).Result()
	return owner
}

// Leader tries to become (or stay) the single instance running a background loop such as the
// dispatch engine. Call it on every tick; it returns true while this instance holds the lease.
func (l *Live) Leader(ctx context.Context, name, instance string, ttl time.Duration) bool {
	owner, err := l.Lock(ctx, "leader:"+name, instance, ttl)
	return err == nil && owner == instance
}
