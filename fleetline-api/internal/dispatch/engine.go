package dispatch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
)

// response is a driver's answer to an offer, carried to the engine goroutine with a reply channel.
type response struct {
	ctx      context.Context
	driverID string
	jobID    string
	accept   bool
	reply    chan error
}

// Run is the auto-dispatch engine: one goroutine, driven by channels.
//
//   - ticker:    releases pre-bookings, recovers stale offers, offers waiting jobs (only on the leader)
//   - nudge:     a job was created or freed, offer now instead of waiting for the tick
//   - expiries:  a 15-second offer timer fired (time.AfterFunc sends the job id)
//   - responses: a driver accepted or rejected an offer
//
// Only one instance in a cluster dispatches: leadership is a Redis lease renewed every tick. Driver
// answers are handled on any instance, safely, because every change runs under Postgres row locks.
func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.TickInterval)
	defer ticker.Stop()
	leader := false
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			leader = s.st.Live.Leader(ctx, "dispatch", s.cfg.Instance, 3*s.cfg.TickInterval)
			if leader {
				s.tick(ctx)
			}
		case <-s.nudge:
			if leader {
				s.logErr("offer waiting jobs", s.offerWaiting(ctx))
			}
		case jobID := <-s.expiries:
			s.logErr("expire offer", s.expire(ctx, jobID))
		case r := <-s.responses:
			r.reply <- s.answer(r)
		}
	}
}

func (s *Service) tick(ctx context.Context) {
	s.logErr("release pre-bookings", s.releasePrebookings(ctx))
	s.logErr("recover offers", s.recoverOffers(ctx))
	s.logErr("offer waiting jobs", s.offerWaiting(ctx))
}

// releasePrebookings moves BOOKED jobs into dispatch once they are inside their lead time.
func (s *Service) releasePrebookings(ctx context.Context) error {
	now := fleet.NowMillis()
	due, err := s.st.Jobs(ctx, s.st.DB, `status = $1 AND pickup_at - (doc->>'leadMin')::bigint * 60000 <= $2`, domain.JobBooked, now)
	if err != nil {
		return err
	}
	for _, d := range due {
		err := s.run(ctx, func(t *txn) error {
			j, err := t.job(d.ID)
			if err != nil || j.Status != domain.JobBooked {
				return err
			}
			t.setJobStatus(j, domain.JobNew)
			t.event(j.ID, "STATUS", "Released to dispatch")
			return nil
		})
		s.logErr("release job", err)
	}
	return nil
}

// recoverOffers expires offers whose timer was lost, for example after a restart or a leader change.
func (s *Service) recoverOffers(ctx context.Context) error {
	now := fleet.NowMillis()
	stale, err := s.st.Jobs(ctx, s.st.DB, `status = $1 AND doc->'offer' IS NOT NULL AND jsonb_typeof(doc->'offer') = 'object' AND (doc->'offer'->>'expiresAt')::bigint <= $2`, domain.JobNew, now-1000)
	if err != nil {
		return err
	}
	for _, j := range stale {
		s.logErr("expire stale offer", s.expire(ctx, j.ID))
	}
	return nil
}

// offerWaiting offers every NEW job without a pending offer to the nearest suitable driver.
// Earlier pickups and higher priority go first, and a driver gets one offer at a time.
func (s *Service) offerWaiting(ctx context.Context) error {
	waiting, err := s.st.Jobs(ctx, s.st.DB, `status = $1 AND (doc->'offer' IS NULL OR jsonb_typeof(doc->'offer') = 'null')`, domain.JobNew)
	if err != nil {
		return err
	}
	sort.SliceStable(waiting, func(a, b int) bool {
		if waiting[a].PickupAt != waiting[b].PickupAt {
			return waiting[a].PickupAt < waiting[b].PickupAt
		}
		return waiting[a].Priority > waiting[b].Priority
	})
	for _, w := range waiting {
		if err := s.offerOne(ctx, w); err != nil && !errors.Is(err, errNoDriver) {
			s.logErr("offer job", err)
		}
	}
	return nil
}

var errNoDriver = errors.New("no driver available")

func (s *Service) offerOne(ctx context.Context, w domain.Job) error {
	return s.run(ctx, func(t *txn) error {
		j, err := t.job(w.ID)
		if err != nil {
			return err
		}
		if j.Status != domain.JobNew || j.Offer != nil {
			return nil
		}
		var d *domain.Driver
		if j.DesignatedDriverID != nil {
			d, err = t.driver(*j.DesignatedDriverID)
			if err != nil || !domain.Dispatchable[d.Status] {
				return errNoDriver
			}
		} else {
			exclude := append(append([]string{}, j.MissedBy...), j.ExcludeDrivers...)
			candidates, err := s.st.NearestDrivers(ctx, t.tx, j.Pickup.Point(), j.Passengers, exclude, 3)
			if err != nil {
				return err
			}
			for _, c := range candidates {
				cand, err := t.driver(c.ID) // locks the row; re-check, another job may have taken them
				if err == nil && domain.Dispatchable[cand.Status] {
					d = cand
					break
				}
			}
			if d == nil {
				return errNoDriver
			}
		}
		j.Offer = &domain.Offer{DriverID: d.ID, OfferedAt: t.now, ExpiresAt: t.now + s.cfg.OfferTimeout.Milliseconds()}
		t.setDriverStatus(d, domain.DriverOffered)
		t.event(j.ID, "OFFERED", "Offered to "+d.Callsign)
		t.offers = append(t.offers, j.ID)
		return nil
	})
}

// expire turns an unanswered offer into a miss.
func (s *Service) expire(ctx context.Context, jobID string) error {
	err := s.run(ctx, func(t *txn) error {
		j, err := t.job(jobID)
		if err != nil {
			return err
		}
		if j.Status != domain.JobNew || j.Offer == nil || t.now < j.Offer.ExpiresAt-250 {
			return nil // answered, cancelled or re-offered since the timer started
		}
		d, err := t.driver(j.Offer.DriverID)
		if err != nil {
			j.Offer = nil
			return nil
		}
		t.missed(j, d, d.Callsign+" missed the offer", s.cfg.MaxMissesBeforeBid)
		return nil
	})
	if err == nil {
		s.Nudge()
	}
	return err
}

// Respond records a driver's answer to an offer. It waits for the engine goroutine to process it.
func (s *Service) Respond(ctx context.Context, driverRef, jobID string, accept bool) error {
	d, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return err
	}
	r := response{ctx: ctx, driverID: d.ID, jobID: jobID, accept: accept, reply: make(chan error, 1)}
	select {
	case s.responses <- r:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-r.reply:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Service) answer(r response) error {
	err := s.run(r.ctx, func(t *txn) error {
		j, err := t.job(r.jobID)
		if err != nil {
			return err
		}
		if j.Offer == nil || j.Offer.DriverID != r.driverID {
			return conflict("this offer is no longer open")
		}
		d, err := t.driver(r.driverID)
		if err != nil {
			return err
		}
		if r.accept {
			t.startTrip(j, d, "ACCEPTED", "Accepted by "+d.Callsign)
			return nil
		}
		t.missed(j, d, d.Callsign+" rejected the offer", s.cfg.MaxMissesBeforeBid)
		return nil
	})
	if err == nil {
		s.Nudge()
	}
	return err
}

// Bid is a driver claiming a job that is open to bids. The first valid bid wins.
func (s *Service) Bid(ctx context.Context, jobID, driverRef string) error {
	ref, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return err
	}
	return s.run(ctx, func(t *txn) error {
		j, err := t.job(jobID)
		if err != nil {
			return err
		}
		if j.Status != domain.JobBidding {
			return conflict("job is not open to bids")
		}
		d, err := t.driver(ref.ID)
		if err != nil {
			return err
		}
		if !domain.Dispatchable[d.Status] {
			return conflict("%s is not available", d.Callsign)
		}
		if d.Seats < j.Passengers {
			return conflict("%s has %d seats, job needs %d", d.Callsign, d.Seats, j.Passengers)
		}
		t.startTrip(j, d, "ACCEPTED", "Bid won by "+d.Callsign)
		return nil
	})
}

// mergeInto applies a JSON patch object onto a job.
func mergeInto(j *domain.Job, patch map[string]any) error {
	raw, err := json.Marshal(j)
	if err != nil {
		return err
	}
	fields := map[string]any{}
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	for k, v := range patch {
		if _, known := fields[k]; !known {
			return fmt.Errorf("unknown field %q", k)
		}
		fields[k] = v
	}
	raw, err = json.Marshal(fields)
	if err != nil {
		return err
	}
	var next domain.Job
	if err := json.Unmarshal(raw, &next); err != nil {
		return err
	}
	next.Normalize()
	*j = next
	return nil
}

// FlushPositions copies GPS pings from Redis into PostGIS on an interval (runs on every instance; cheap when idle).
func (s *Service) FlushPositions(ctx context.Context, every time.Duration, keepTracks time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	prune := time.NewTicker(10 * time.Minute)
	defer prune.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			batch, err := s.st.Live.TakeDirty(ctx)
			if err != nil {
				slog.Warn("read positions", "err", err)
				continue
			}
			if err := s.st.FlushPositions(ctx, batch); err != nil {
				slog.Warn("flush positions", "err", err)
			}
		case <-prune.C:
			s.st.PruneTracks(ctx, fleet.NowMillis()-keepTracks.Milliseconds())
		}
	}
}
