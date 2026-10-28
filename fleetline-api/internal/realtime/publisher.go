package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"fleetline/api/internal/domain"
)

// Channel is the Redis Pub/Sub channel every instance publishes to and listens on.
const Channel = "fleet:realtime"

type changeKind int

const (
	kindJob changeKind = iota
	kindAdded
	kindDriver
	kindEvent
	kindAlert
	kindZones
	kindRemoved
	kindCall
)

type change struct {
	kind    changeKind
	id      string
	changes map[string]any
	job     *domain.Job
	event   *domain.JobEvent
	alert   *domain.Alert
	zones   []domain.Zone
	call    *domain.IncomingCall
}

// Publisher coalesces changes and publishes one batch per flush interval.
// All methods are safe to call from any goroutine: they only send on a channel.
type Publisher struct {
	rdb      *redis.Client
	in       chan change
	interval time.Duration
	local    func([]byte) // fallback when Redis is unavailable: deliver to this instance only
}

func NewPublisher(rdb *redis.Client, interval time.Duration) *Publisher {
	return &Publisher{rdb: rdb, in: make(chan change, 4096), interval: interval}
}

// FallbackTo sets where batches go if Redis publishing fails.
func (p *Publisher) FallbackTo(deliver func([]byte)) { p.local = deliver }

func (p *Publisher) send(c change) {
	select {
	case p.in <- c:
	default:
		slog.Warn("realtime buffer full, dropping change")
	}
}

// Job sends changed fields of an existing job.
func (p *Publisher) Job(id string, changes map[string]any) {
	p.send(change{kind: kindJob, id: id, changes: changes})
}

// JobFull sends the whole job as its change set.
func (p *Publisher) JobFull(job domain.Job) { p.Job(job.ID, ToMap(job)) }

// Added announces a job the consoles do not have yet.
func (p *Publisher) Added(job domain.Job) { p.send(change{kind: kindAdded, job: &job}) }

func (p *Publisher) Removed(jobID string) { p.send(change{kind: kindRemoved, id: jobID}) }

func (p *Publisher) Driver(id string, changes map[string]any) {
	p.send(change{kind: kindDriver, id: id, changes: changes})
}

func (p *Publisher) DriverFull(d domain.Driver) { p.Driver(d.ID, ToMap(d)) }

func (p *Publisher) Event(e domain.JobEvent) { p.send(change{kind: kindEvent, event: &e}) }

func (p *Publisher) Alert(a domain.Alert) { p.send(change{kind: kindAlert, alert: &a}) }

func (p *Publisher) Zones(z []domain.Zone) { p.send(change{kind: kindZones, zones: z}) }

func (p *Publisher) Call(c domain.IncomingCall) { p.send(change{kind: kindCall, call: &c}) }

// Run merges changes and flushes them until ctx ends.
func (p *Publisher) Run(ctx context.Context) {
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	acc := newPending()
	dirty := false
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-p.in:
			acc.apply(c)
			dirty = true
		case <-ticker.C:
			if !dirty {
				continue
			}
			batch := acc.build(time.Now().UnixMilli())
			acc, dirty = newPending(), false
			if batch.empty() {
				continue
			}
			raw, err := json.Marshal(batch)
			if err != nil {
				slog.Error("encode batch", "err", err)
				continue
			}
			if err := p.rdb.Publish(ctx, Channel, raw).Err(); err != nil {
				slog.Warn("redis publish failed, delivering locally", "err", err)
				if p.local != nil {
					p.local(raw)
				}
			}
		}
	}
}
