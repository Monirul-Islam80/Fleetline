// Package realtime pushes state changes to every connected console.
//
// Flow: any code that changes a job, driver, zone or alert calls Publisher.Job/Driver/... The
// publisher merges changes for a few hundred milliseconds, then PUBLISHes one Batch to Redis.
// Every server instance subscribes to that channel and forwards the batch to its own WebSocket
// clients, so consoles connected to different instances see the same thing.
package realtime

import (
	"encoding/json"

	"fleetline/api/internal/domain"
)

// Update is Redux Toolkit's Update<T>: an id and the changed fields.
type Update struct {
	ID      string         `json:"id"`
	Changes map[string]any `json:"changes"`
}

// Batch is RealtimeBatch in the console's src/store/actions.ts, plus the optional fields the live
// backend adds (added jobs, removed jobs, incoming calls).
type Batch struct {
	Now     domain.Millis         `json:"now"`
	Jobs    []Update              `json:"jobs"`
	Drivers []Update              `json:"drivers"`
	Events  []domain.JobEvent     `json:"events"`
	Alerts  []domain.Alert        `json:"alerts"`
	Zones   []domain.Zone         `json:"zones,omitempty"`
	Added   []domain.Job          `json:"added,omitempty"`
	Removed []string              `json:"removed,omitempty"`
	Calls   []domain.IncomingCall `json:"calls,omitempty"`
}

func (b *Batch) empty() bool {
	return len(b.Jobs) == 0 && len(b.Drivers) == 0 && len(b.Events) == 0 && len(b.Alerts) == 0 &&
		b.Zones == nil && len(b.Added) == 0 && len(b.Removed) == 0 && len(b.Calls) == 0
}

// ToMap turns a struct into the field map an Update carries.
func ToMap(v any) map[string]any {
	raw, err := json.Marshal(v)
	if err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return out
}

// pending collects changes between flushes. Later changes to the same id overwrite earlier fields.
type pending struct {
	jobs    map[string]map[string]any
	jobIDs  []string
	drivers map[string]map[string]any
	drvIDs  []string
	added   map[string]domain.Job
	addIDs  []string
	batch   Batch
}

func newPending() *pending {
	return &pending{
		jobs:    map[string]map[string]any{},
		drivers: map[string]map[string]any{},
		added:   map[string]domain.Job{},
	}
}

func merge(store map[string]map[string]any, order *[]string, id string, changes map[string]any) {
	current, ok := store[id]
	if !ok {
		current = map[string]any{}
		store[id] = current
		*order = append(*order, id)
	}
	for k, v := range changes {
		current[k] = v
	}
}

func (p *pending) apply(c change) {
	switch c.kind {
	case kindJob:
		// A job added in this window is re-sent whole, so the add and its later changes stay one message.
		if job, ok := p.added[c.id]; ok {
			fields := ToMap(job)
			for k, v := range c.changes {
				fields[k] = v
			}
			raw, _ := json.Marshal(fields)
			var merged domain.Job
			if json.Unmarshal(raw, &merged) == nil {
				p.added[c.id] = merged
			}
			return
		}
		merge(p.jobs, &p.jobIDs, c.id, c.changes)
	case kindAdded:
		if _, ok := p.added[c.job.ID]; !ok {
			p.addIDs = append(p.addIDs, c.job.ID)
		}
		p.added[c.job.ID] = *c.job
	case kindDriver:
		merge(p.drivers, &p.drvIDs, c.id, c.changes)
	case kindEvent:
		p.batch.Events = append(p.batch.Events, *c.event)
	case kindAlert:
		p.batch.Alerts = append(p.batch.Alerts, *c.alert)
	case kindZones:
		p.batch.Zones = c.zones
	case kindRemoved:
		p.batch.Removed = append(p.batch.Removed, c.id)
	case kindCall:
		p.batch.Calls = append(p.batch.Calls, *c.call)
	}
}

func (p *pending) build(now domain.Millis) Batch {
	b := p.batch
	b.Now = now
	b.Jobs = make([]Update, 0, len(p.jobIDs))
	for _, id := range p.jobIDs {
		b.Jobs = append(b.Jobs, Update{ID: id, Changes: p.jobs[id]})
	}
	b.Drivers = make([]Update, 0, len(p.drvIDs))
	for _, id := range p.drvIDs {
		b.Drivers = append(b.Drivers, Update{ID: id, Changes: p.drivers[id]})
	}
	for _, id := range p.addIDs {
		b.Added = append(b.Added, p.added[id])
	}
	if b.Events == nil {
		b.Events = []domain.JobEvent{}
	}
	if b.Alerts == nil {
		b.Alerts = []domain.Alert{}
	}
	// The console shows events newest first.
	for i, j := 0, len(b.Events)-1; i < j; i, j = i+1, j-1 {
		b.Events[i], b.Events[j] = b.Events[j], b.Events[i]
	}
	return b
}
