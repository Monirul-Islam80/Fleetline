// Package sim plays the driver apps and passengers for a demo. It never touches the database directly:
// it calls the same dispatch methods the real driver-app endpoints call (Ping, Respond, DriverJobStatus,
// SetPresence, Bid, CreateJob), so the demo exercises the real engine end to end.
//
// Only drivers marked simulated (the seeded ones) are driven. Turn it off with SIM_DRIVERS=false once
// real driver apps connect.
package sim

import (
	"context"
	"log/slog"
	"math/rand"
	"time"

	"fleetline/api/internal/dispatch"
	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/seed"
	"fleetline/api/internal/store"
)

type Config struct {
	Tick             time.Duration // one simulation step
	SpeedFactor      float64       // demo time runs this many times faster than real driving
	AppBookingsEvery time.Duration // 0 disables the passenger-app feed
	AcceptProb       float64
	NoShowProb       float64
	Instance         string
}

type offerKey struct{ job, driver string }

type Sim struct {
	st  *store.Store
	svc *dispatch.Service
	cfg Config
	rnd *rand.Rand

	decisions map[offerKey]time.Time // when the offered bot answers (zero: lets the offer expire)
	wander    map[string]domain.LatLng
}

func New(st *store.Store, svc *dispatch.Service, cfg Config) *Sim {
	return &Sim{st: st, svc: svc, cfg: cfg, rnd: rand.New(rand.NewSource(time.Now().UnixNano())),
		decisions: map[offerKey]time.Time{}, wander: map[string]domain.LatLng{}}
}

const (
	carSpeedMps     = 11.0
	arrivedRadiusM  = 60.0
	droppingRadiusM = 450.0
	waitAtPickup    = 6 * time.Second
)

// Run steps the simulation. Like the engine, only the leader instance simulates.
func (s *Sim) Run(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.Tick)
	defer ticker.Stop()
	var feed <-chan time.Time
	if s.cfg.AppBookingsEvery > 0 {
		t := time.NewTicker(s.cfg.AppBookingsEvery)
		defer t.Stop()
		feed = t.C
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if s.st.Live.Leader(ctx, "sim", s.cfg.Instance, 3*s.cfg.Tick) {
				s.step(ctx)
			}
		case <-feed:
			if s.st.Live.Leader(ctx, "sim", s.cfg.Instance, 3*s.cfg.Tick) {
				s.appBooking(ctx)
			}
		}
	}
}

func (s *Sim) step(ctx context.Context) {
	drivers, err := s.st.Drivers(ctx, s.st.DB, `simulated AND active`)
	if err != nil {
		slog.Warn("sim: load drivers", "err", err)
		return
	}
	jobs, err := s.st.Jobs(ctx, s.st.DB, `status = ANY($1)`, []string{domain.JobNew, domain.JobBidding, domain.JobEnroute, domain.JobArrived, domain.JobPOB, domain.JobDroppingOff})
	if err != nil {
		slog.Warn("sim: load jobs", "err", err)
		return
	}
	byID := map[string]domain.Job{}
	offeredTo := map[string]domain.Job{}
	for _, j := range jobs {
		byID[j.ID] = j
		if j.Offer != nil {
			offeredTo[j.Offer.DriverID] = j
		}
	}
	step := carSpeedMps * s.cfg.Tick.Seconds() * s.cfg.SpeedFactor
	for _, d := range drivers {
		s.driver(ctx, d, byID, offeredTo, step)
	}
	s.bids(ctx, jobs, drivers)
	s.forget(byID)
}

func (s *Sim) move(ctx context.Context, d domain.Driver, target domain.LatLng, stepM float64) domain.LatLng {
	next := fleet.StepTowards(d.Point(), target, stepM)
	if _, err := s.svc.Ping(ctx, d.ID, next.Lat, next.Lng); err != nil {
		slog.Debug("sim: ping", "err", err)
	}
	return next
}

func (s *Sim) driver(ctx context.Context, d domain.Driver, jobs map[string]domain.Job, offered map[string]domain.Job, step float64) {
	var job *domain.Job
	if d.CurrentJobID != nil {
		if j, ok := jobs[*d.CurrentJobID]; ok {
			job = &j
		}
	}
	switch d.Status {
	case domain.DriverOffered:
		j, ok := offered[d.ID]
		if !ok {
			return
		}
		key := offerKey{j.ID, d.ID}
		when, decided := s.decisions[key]
		if !decided {
			when = time.Time{}
			if j.DesignatedDriverID != nil || s.rnd.Float64() < s.cfg.AcceptProb {
				when = time.Now().Add(time.Duration(2+s.rnd.Intn(7)) * time.Second)
			}
			s.decisions[key] = when
		}
		if !when.IsZero() && time.Now().After(when) {
			s.logErr("accept", s.svc.Respond(ctx, d.ID, j.ID, true))
		}
	case domain.DriverEnroute:
		if job == nil {
			return
		}
		pos := s.move(ctx, d, job.Pickup.Point(), step)
		if fleet.DistanceM(pos, job.Pickup.Point()) <= arrivedRadiusM {
			s.status(ctx, d, domain.JobArrived)
		}
	case domain.DriverArrived:
		if job == nil || time.Since(time.UnixMilli(d.StatusSince)) < waitAtPickup {
			return
		}
		if s.rnd.Float64() < s.cfg.NoShowProb {
			s.status(ctx, d, domain.JobNoShow)
			return
		}
		s.status(ctx, d, domain.JobPOB)
	case domain.DriverPOB, domain.DriverDropping:
		if job == nil {
			return
		}
		target := fleet.Jitter(job.Pickup.Point(), 3000, s.rnd.Float64)
		if job.Dropoff != nil {
			target = job.Dropoff.Point()
		} else if d.Target != nil {
			target = *d.Target
		}
		pos := s.move(ctx, d, target, step)
		left := fleet.DistanceM(pos, target)
		switch {
		case left <= arrivedRadiusM:
			s.status(ctx, d, domain.JobCompleted)
		case d.Status == domain.DriverPOB && left <= droppingRadiusM:
			s.status(ctx, d, domain.JobDroppingOff)
		}
	case domain.DriverAvailable:
		if target, ok := s.wander[d.ID]; ok {
			pos := s.move(ctx, d, target, step*0.5)
			if fleet.DistanceM(pos, target) < 20 {
				delete(s.wander, d.ID)
			}
			return
		}
		switch r := s.rnd.Float64(); {
		case r < 0.03:
			s.presence(ctx, d, domain.DriverParked)
		case r < 0.032:
			s.presence(ctx, d, domain.DriverAway)
		case r < 0.15:
			zone := s.zoneOf(d)
			s.wander[d.ID] = fleet.Jitter(domain.LatLng{Lat: zone.Lat, Lng: zone.Lng}, float64(zone.RadiusM)*0.7, s.rnd.Float64)
		}
	case domain.DriverParked:
		if s.rnd.Float64() < 0.008 {
			s.presence(ctx, d, domain.DriverAvailable)
		}
	case domain.DriverAway:
		if s.rnd.Float64() < 0.004 {
			s.presence(ctx, d, domain.DriverAvailable)
		}
	}
}

func (s *Sim) zoneOf(d domain.Driver) domain.Zone {
	for _, z := range seed.Zones {
		if d.ZoneID != nil && z.ID == *d.ZoneID {
			return z
		}
	}
	return seed.Zones[s.rnd.Intn(len(seed.Zones))]
}

// bids: now and then the nearest free bot claims a job that is open to bids.
func (s *Sim) bids(ctx context.Context, jobs []domain.Job, drivers []domain.Driver) {
	for _, j := range jobs {
		if j.Status != domain.JobBidding || s.rnd.Float64() > 0.06 {
			continue
		}
		var best *domain.Driver
		bestM := 0.0
		for i := range drivers {
			d := &drivers[i]
			if !domain.Dispatchable[d.Status] || d.Seats < j.Passengers {
				continue
			}
			if m := fleet.DistanceM(d.Point(), j.Pickup.Point()); best == nil || m < bestM {
				best, bestM = d, m
			}
		}
		if best != nil {
			s.logErr("bid", s.svc.Bid(ctx, j.ID, best.ID))
			best.Status = domain.DriverEnroute
		}
	}
}

func (s *Sim) forget(live map[string]domain.Job) {
	for key := range s.decisions {
		if _, ok := live[key.job]; !ok {
			delete(s.decisions, key)
		}
	}
}

func (s *Sim) status(ctx context.Context, d domain.Driver, status string) {
	_, err := s.svc.DriverJobStatus(ctx, d.ID, status)
	s.logErr("trip status", err)
}

func (s *Sim) presence(ctx context.Context, d domain.Driver, status string) {
	_, err := s.svc.SetPresence(ctx, d.ID, status)
	s.logErr("presence", err)
}

func (s *Sim) logErr(what string, err error) {
	if err != nil && !dispatch.IsNotFound(err) {
		slog.Debug("sim: "+what, "err", err)
	}
}

var demoNames = []string{"RUBY ASHDOWN", "FINN CALLOWAY", "HATTIE MARSH", "JOEL PENROSE", "NINA FENWICK", "OWEN HARTLEY"}

// appBooking books a passenger-app job now and then, so the board keeps moving during a demo.
func (s *Sim) appBooking(ctx context.Context) {
	pickup := seed.Places[s.rnd.Intn(len(seed.Places))]
	drop := seed.Places[s.rnd.Intn(len(seed.Places))]
	for drop.ID == pickup.ID {
		drop = seed.Places[s.rnd.Intn(len(seed.Places))]
	}
	p, d := pickup.Stop(), drop.Stop()
	_, err := s.svc.CreateJob(ctx, domain.CreateJobInput{
		PickupAt: fleet.NowMillis(), LeadMin: 15, Priority: 5, Passengers: 1 + s.rnd.Intn(3), Taxis: 1,
		Vehicle: "SALOON", Pickup: &p, Dropoff: &d,
		CustomerName: demoNames[s.rnd.Intn(len(demoNames))],
		Phone:        seed.FakePhone(500 + s.rnd.Intn(500)),
		Payment:      "CARD", Source: "APP", SiteID: seed.Sites[s.rnd.Intn(len(seed.Sites))].ID,
		Options: domain.BookingOptions{SendSMS: true, SendRingback: true},
	}, "Passenger app")
	s.logErr("app booking", err)
}
