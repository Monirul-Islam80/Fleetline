// Package dispatch owns every job and driver state change: operator actions, driver-app actions
// and the automatic offer engine. Each change runs in one Postgres transaction with row locks, then
// the touched rows are published to the consoles after commit.
package dispatch

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/realtime"
	"fleetline/api/internal/store"
)

// Errors handlers turn into 4xx responses.
var (
	ErrConflict = errors.New("conflict")
	ErrInvalid  = errors.New("invalid request")
)

func conflict(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrConflict, fmt.Sprintf(format, args...))
}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

type Config struct {
	OfferTimeout       time.Duration // how long a driver has to accept: 15 s
	MaxMissesBeforeBid int           // after this many missed offers the job opens for bids
	TickInterval       time.Duration
	Instance           string // this server's id, for leader election
}

type Service struct {
	st  *store.Store
	pub *realtime.Publisher
	cfg Config

	nudge     chan struct{}
	expiries  chan string
	responses chan response
}

func New(st *store.Store, pub *realtime.Publisher, cfg Config) *Service {
	return &Service{
		st:        st,
		pub:       pub,
		cfg:       cfg,
		nudge:     make(chan struct{}, 1),
		expiries:  make(chan string, 1024),
		responses: make(chan response),
	}
}

// Nudge asks the engine to look for work now instead of at the next tick.
func (s *Service) Nudge() {
	select {
	case s.nudge <- struct{}{}:
	default:
	}
}

/* ---------- Transaction scope ---------- */

// txn tracks every job and driver a change touches, so all of them are saved and published together.
type txn struct {
	ctx     context.Context
	tx      *sqlx.Tx
	st      *store.Store
	now     domain.Millis
	jobs    map[string]*domain.Job
	jobIDs  []string
	added   map[string]bool
	drivers map[string]*domain.Driver
	drvIDs  []string
	events  []domain.JobEvent
	alerts  []domain.Alert
	zones   bool
	offers  []string // jobs that got a new offer, for the expiry timers
}

func (t *txn) job(id string) (*domain.Job, error) {
	if j, ok := t.jobs[id]; ok {
		return j, nil
	}
	j, err := t.st.JobForUpdate(t.ctx, t.tx, id)
	if err != nil {
		return nil, err
	}
	t.jobs[id] = &j
	t.jobIDs = append(t.jobIDs, id)
	return &j, nil
}

func (t *txn) addJob(j domain.Job) *domain.Job {
	t.jobs[j.ID] = &j
	t.jobIDs = append(t.jobIDs, j.ID)
	t.added[j.ID] = true
	return &j
}

func (t *txn) driver(id string) (*domain.Driver, error) {
	if d, ok := t.drivers[id]; ok {
		return d, nil
	}
	d, err := t.st.DriverForUpdate(t.ctx, t.tx, id)
	if err != nil {
		return nil, err
	}
	t.drivers[id] = &d
	t.drvIDs = append(t.drvIDs, id)
	return &d, nil
}

func (t *txn) event(jobID, typ, text string) {
	t.events = append(t.events, domain.JobEvent{ID: fleet.NewID("ev"), JobID: jobID, Type: typ, At: t.now, Text: text})
}

func (t *txn) alert(kind, title, message string, jobID, callsign *string) {
	t.alerts = append(t.alerts, domain.Alert{ID: fleet.NewID("al"), At: t.now, Kind: kind, Title: title, Message: message, JobID: jobID, Callsign: callsign})
}

func (t *txn) setJobStatus(j *domain.Job, status string) {
	if j.Status != status {
		j.Status = status
		j.StatusSince = t.now
	}
}

func (t *txn) setDriverStatus(d *domain.Driver, status string) {
	if d.Status != status {
		d.Status = status
		d.StatusSince = t.now
	}
}

// run executes fn in a transaction, saves everything it touched, commits, then publishes.
func (s *Service) run(ctx context.Context, fn func(t *txn) error) error {
	t := &txn{
		ctx: ctx, st: s.st, now: fleet.NowMillis(),
		jobs: map[string]*domain.Job{}, added: map[string]bool{}, drivers: map[string]*domain.Driver{},
	}
	err := s.st.Tx(ctx, func(tx *sqlx.Tx) error {
		t.tx = tx
		if err := fn(t); err != nil {
			return err
		}
		for _, id := range t.jobIDs {
			j := t.jobs[id]
			j.UpdatedAt = t.now
			if err := s.st.SaveJob(ctx, tx, *j); err != nil {
				return err
			}
		}
		for _, id := range t.drvIDs {
			d := t.drivers[id]
			d.UpdatedAt = t.now
			if err := s.st.SaveDriver(ctx, tx, *d); err != nil {
				return err
			}
		}
		for _, e := range t.events {
			if err := s.st.AddEvent(ctx, tx, e); err != nil {
				return err
			}
		}
		for _, a := range t.alerts {
			if err := s.st.InboxPut(ctx, tx, store.KindAlert, a.ID, a.At, a); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.publish(ctx, t)
	return nil
}

func (s *Service) publish(ctx context.Context, t *txn) {
	for _, id := range t.jobIDs {
		if t.added[id] {
			s.pub.Added(*t.jobs[id])
		} else {
			s.pub.JobFull(*t.jobs[id])
		}
	}
	for _, id := range t.drvIDs {
		s.pub.DriverFull(*t.drivers[id])
	}
	for _, e := range t.events {
		s.pub.Event(e)
	}
	for _, a := range t.alerts {
		s.pub.Alert(a)
	}
	if t.zones {
		if zones, err := s.st.Zones(ctx); err == nil {
			s.pub.Zones(zones)
		}
	}
	for _, jobID := range t.offers {
		id := jobID
		time.AfterFunc(s.cfg.OfferTimeout, func() {
			select {
			case s.expiries <- id:
			default:
			}
		})
	}
}

/* ---------- Shared transitions ---------- */

// release frees the driver holding or offered a job, if they are still tied to it.
func (t *txn) release(j *domain.Job) error {
	driverID := j.DriverID
	if j.Offer != nil {
		driverID = &j.Offer.DriverID
	}
	if driverID == nil {
		return nil
	}
	d, err := t.driver(*driverID)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	tied := (d.CurrentJobID != nil && *d.CurrentJobID == j.ID) || d.Status == domain.DriverOffered
	if !tied {
		return nil
	}
	t.setDriverStatus(d, domain.DriverAvailable)
	d.CurrentJobID = nil
	d.Target = nil
	return nil
}

// startTrip gives the job to the driver and sends them to the pickup.
func (t *txn) startTrip(j *domain.Job, d *domain.Driver, eventType, text string) {
	t.setJobStatus(j, domain.JobEnroute)
	j.DriverID = fleet.Ptr(d.ID)
	j.Offer = nil
	t.event(j.ID, eventType, text)
	t.setDriverStatus(d, domain.DriverEnroute)
	d.CurrentJobID = fleet.Ptr(j.ID)
	d.Target = &domain.LatLng{Lat: j.Pickup.Lat, Lng: j.Pickup.Lng}
}

// missed records a missed or rejected offer and opens the job to bids after too many.
func (t *txn) missed(j *domain.Job, d *domain.Driver, text string, maxMisses int) {
	j.Offer = nil
	j.MissedBy = append(j.MissedBy, d.Callsign)
	t.event(j.ID, "MISSED", text)
	if d.Status == domain.DriverOffered {
		t.setDriverStatus(d, domain.DriverAvailable)
	}
	if len(j.MissedBy) >= maxMisses && j.DesignatedDriverID == nil {
		t.setJobStatus(j, domain.JobBidding)
		t.event(j.ID, "STATUS", fmt.Sprintf("Open to bid after %d missed offers", len(j.MissedBy)))
	}
}

func (s *Service) logErr(what string, err error) {
	if err != nil && !errors.Is(err, store.ErrNotFound) && !errors.Is(err, ErrConflict) {
		slog.Error(what, "err", err)
	}
}
