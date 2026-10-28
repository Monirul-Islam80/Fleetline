package dispatch

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

// Event texts match the console's thunks (src/store/thunks/jobActions.ts), so the console can tell its
// own optimistic event from the server's copy and show it once.
const (
	textPaused     = "Paused by operator"
	textResumed    = "Resumed by operator"
	textRedispatch = "Re-dispatched by operator"
	textCancelled  = "Cancelled by operator"
	textNoShow     = "No-show set by operator"
)

// CreateJob books a job. The server decides id, number and status.
func (s *Service) CreateJob(ctx context.Context, in domain.CreateJobInput, createdBy string) (domain.Job, error) {
	if in.Pickup == nil {
		return domain.Job{}, invalid("pickup is required")
	}
	if strings.TrimSpace(in.CustomerName) == "" && strings.TrimSpace(in.Phone) == "" {
		return domain.Job{}, invalid("name or phone is required")
	}
	if in.Vehicle == "" {
		in.Vehicle = "SALOON"
	}
	vehicle, ok := fleet.Vehicles[in.Vehicle]
	if !ok {
		return domain.Job{}, invalid("unknown vehicle %q", in.Vehicle)
	}
	in.Passengers = max(in.Passengers, 1)
	if in.Passengers > vehicle.Seats {
		return domain.Job{}, invalid("a %s seats %d", vehicle.Label, vehicle.Seats)
	}
	in.Taxis = max(in.Taxis, 1)
	if in.LeadMin <= 0 {
		in.LeadMin = 15
	}
	if in.Priority == 0 {
		in.Priority = 5
	}
	if in.Source == "" {
		in.Source = "PHONE"
	}
	if in.Payment == "" {
		in.Payment = "CASH"
		if in.AccountCode != nil && *in.AccountCode != "" {
			in.Payment = "ACCOUNT"
		}
	}
	if in.SiteID == "" {
		in.SiteID = "wc"
	}
	now := fleet.NowMillis()
	if in.PickupAt == 0 {
		in.PickupAt = now
	}
	if in.PickupAt < now-5*60_000 {
		return domain.Job{}, invalid("pickup time has passed")
	}

	// Stops typed by hand may lack a zone: point-in-polygon fills it in.
	fillZone := func(stop *domain.Stop) {
		if stop == nil || (stop.ZoneID != nil && *stop.ZoneID != "") {
			return
		}
		if z, err := s.st.ZoneAt(ctx, s.st.DB, stop.Point()); err == nil && z != nil {
			stop.ZoneID = fleet.Ptr(z.ID)
		}
	}
	fillZone(in.Pickup)
	fillZone(in.Dropoff)
	for i := range in.Vias {
		fillZone(&in.Vias[i])
	}

	if in.Fare == nil && in.Dropoff != nil {
		quote, err := s.Quote(ctx, *in.Pickup, in.Vias, in.Dropoff)
		if err == nil {
			in.Fare = fleet.Ptr(quote.Quotes[fleet.TariffFor(in.Vehicle)].Price)
		}
	}

	var designated *string
	if in.DesignatedCallsign != nil && strings.TrimSpace(*in.DesignatedCallsign) != "" {
		d, err := s.st.DriverByRef(ctx, s.st.DB, *in.DesignatedCallsign)
		if err != nil {
			return domain.Job{}, invalid("unknown driver %q", *in.DesignatedCallsign)
		}
		designated = fleet.Ptr(d.ID)
	}

	var created domain.Job
	err := s.run(ctx, func(t *txn) error {
		number, err := s.st.NextJobNumber(ctx, t.tx)
		if err != nil {
			return err
		}
		status := domain.JobBooked
		if in.PickupAt-int64(in.LeadMin)*60_000 <= t.now {
			status = domain.JobNew
		}
		j := domain.Job{
			ID: fleet.NewID("job"), Number: number, Status: status,
			PickupAt: in.PickupAt, IsAsap: in.PickupAt <= t.now+60_000,
			LeadMin: in.LeadMin, Priority: in.Priority, Passengers: in.Passengers, Taxis: in.Taxis,
			Vehicle: in.Vehicle, Extras: in.Extras,
			Pickup: *in.Pickup, Vias: in.Vias, Dropoff: in.Dropoff,
			CustomerName: strings.ToUpper(strings.TrimSpace(in.CustomerName)), Phone: in.Phone, AltPhone: in.AltPhone, Email: in.Email,
			Instructions: in.Instructions, CustomerNotes: in.CustomerNotes, OperatorNotes: in.OperatorNotes,
			ExcludeDrivers: in.ExcludeDrivers, AccountCode: in.AccountCode,
			Payment: in.Payment, Source: in.Source, SiteID: in.SiteID,
			Fare: in.Fare, FareOverridden: in.FareOverridden,
			DesignatedDriverID: designated, Options: in.Options,
			CreatedBy: createdBy, CreatedAt: t.now, UpdatedAt: t.now, StatusSince: t.now,
		}
		if j.CustomerName == "" {
			j.CustomerName = "CALLER"
		}
		j.Normalize()
		created = *t.addJob(j)
		text := map[string]string{"PHONE": "Booked by phone", "APP": "Booked in the passenger app", "WEB": "Booked on the website"}[in.Source]
		if text == "" {
			text = "Booked"
		}
		t.event(j.ID, "CREATED", text)
		if in.Source == "APP" {
			t.alert("APP_BOOKING", "New APP Booking",
				fmt.Sprintf("CUST: %s\nPICKUP: %s, %s, %s", j.CustomerName, strings.ToUpper(j.Pickup.Label), strings.ToUpper(j.Pickup.Area), j.Pickup.Postcode),
				fleet.Ptr(j.ID), nil)
		}
		return s.rememberCustomer(t, j)
	})
	if err == nil {
		s.Nudge()
	}
	return created, err
}

// rememberCustomer keeps the caller-ID list current: a known number gets its trip count and recent place
// updated, a new number becomes a customer.
func (s *Service) rememberCustomer(t *txn, j domain.Job) error {
	if len(fleet.Digits(j.Phone)) < 7 {
		return nil
	}
	c, err := s.st.CustomerByPhone(t.ctx, j.Phone)
	if err != nil {
		return err
	}
	if c == nil {
		c = &domain.Customer{ID: fleet.NewID("c"), Name: j.CustomerName, Phone: j.Phone, Email: j.Email, AccountCode: j.AccountCode, RecentPlaceIDs: []string{}}
	}
	c.TripCount++
	return s.st.SaveCustomer(t.ctx, t.tx, *c)
}

// Action is an operator action on a job, as the console names them.
func (s *Service) Action(ctx context.Context, jobID, action, callsign string) (domain.Job, error) {
	var out domain.Job
	err := s.run(ctx, func(t *txn) error {
		j, err := t.job(jobID)
		if err != nil {
			return err
		}
		switch action {
		case "pause":
			if !domain.Unassigned[j.Status] && j.Status != domain.JobBooked {
				return conflict("only unassigned jobs can be paused")
			}
			if err := t.release(j); err != nil {
				return err
			}
			t.setJobStatus(j, domain.JobPaused)
			j.Offer = nil
			t.event(j.ID, "PAUSED", textPaused)
		case "resume":
			if j.Status != domain.JobPaused {
				return conflict("job is not paused")
			}
			t.setJobStatus(j, domain.JobNew)
			j.MissedBy = []string{}
			t.event(j.ID, "RESUMED", textResumed)
		case "redispatch":
			if domain.Terminal[j.Status] {
				return conflict("job is %s", strings.ToLower(j.Status))
			}
			if err := t.release(j); err != nil {
				return err
			}
			t.setJobStatus(j, domain.JobNew)
			j.DriverID, j.Offer, j.MissedBy = nil, nil, []string{}
			t.event(j.ID, "STATUS", textRedispatch)
		case "cancel":
			if domain.Terminal[j.Status] {
				return conflict("job is already %s", strings.ToLower(j.Status))
			}
			if err := t.release(j); err != nil {
				return err
			}
			t.setJobStatus(j, domain.JobCancelled)
			j.Offer = nil
			t.event(j.ID, "CANCELLED", textCancelled)
		case "noshow":
			if domain.Terminal[j.Status] {
				return conflict("job is already %s", strings.ToLower(j.Status))
			}
			if err := t.release(j); err != nil {
				return err
			}
			t.setJobStatus(j, domain.JobNoShow)
			j.Offer = nil
			t.event(j.ID, "NOSHOW", textNoShow)
		case "complete":
			if domain.Terminal[j.Status] {
				return conflict("job is already %s", strings.ToLower(j.Status))
			}
			if err := t.release(j); err != nil {
				return err
			}
			t.setJobStatus(j, domain.JobCompleted)
			j.Offer = nil
			t.event(j.ID, "STATUS", "Completed by operator")
		case "reopen":
			if j.Status != domain.JobNoShow && j.Status != domain.JobCancelled {
				return conflict("only no-show or cancelled jobs can be reopened")
			}
			t.setJobStatus(j, domain.JobNew)
			j.DriverID, j.Offer, j.MissedBy = nil, nil, []string{}
			t.event(j.ID, "STATUS", "Reopened, no-show rejected")
		case "assign":
			return s.assign(t, j, callsign)
		default:
			return invalid("unknown action %q", action)
		}
		out = *j
		return nil
	})
	if err == nil {
		s.Nudge()
		if action == "assign" {
			out, err = s.st.Job(ctx, s.st.DB, jobID)
		}
	}
	return out, err
}

// assign is manual allocation by callsign, as the console's Driver ID box does it.
func (s *Service) assign(t *txn, j *domain.Job, callsign string) error {
	if domain.Terminal[j.Status] {
		return conflict("job is %s", strings.ToLower(j.Status))
	}
	ref, err := s.st.DriverByRef(t.ctx, t.tx, callsign)
	if err != nil {
		return invalid("no driver with callsign %q", callsign)
	}
	d, err := t.driver(ref.ID)
	if err != nil {
		return err
	}
	if d.CurrentJobID != nil && *d.CurrentJobID != j.ID {
		current, err := t.job(*d.CurrentJobID)
		if err == nil && domain.ActiveTrip[current.Status] {
			return conflict("%s is on another job", d.Callsign)
		}
	}
	if err := t.release(j); err != nil {
		return err
	}
	t.startTrip(j, d, "ASSIGNED", "Allocated to "+d.Callsign)
	return nil
}

// UpdateJob applies a PATCH from an operator. Status, driver and number change only through actions.
func (s *Service) UpdateJob(ctx context.Context, jobID string, patch map[string]any) (domain.Job, error) {
	for _, field := range []string{"id", "number", "status", "driverId", "offer", "createdAt", "createdBy", "statusSince", "updatedAt"} {
		delete(patch, field)
	}
	var out domain.Job
	err := s.run(ctx, func(t *txn) error {
		j, err := t.job(jobID)
		if err != nil {
			return err
		}
		if domain.Terminal[j.Status] {
			return conflict("job is %s", strings.ToLower(j.Status))
		}
		if err := mergeInto(j, patch); err != nil {
			return invalid("%v", err)
		}
		// A changed pickup time may move a pre-booking into dispatch, or back.
		if j.Status == domain.JobBooked || j.Status == domain.JobNew {
			if j.PickupAt-int64(j.LeadMin)*60_000 <= t.now {
				if j.Status == domain.JobBooked {
					t.setJobStatus(j, domain.JobNew)
				}
			} else if j.Status == domain.JobNew && j.Offer == nil {
				t.setJobStatus(j, domain.JobBooked)
			}
		}
		t.event(j.ID, "STATUS", "Booking edited")
		out = *j
		return nil
	})
	if err == nil {
		s.Nudge()
	}
	return out, err
}

// DeleteJob removes a job entirely, freeing its driver first.
func (s *Service) DeleteJob(ctx context.Context, jobID string) error {
	err := s.run(ctx, func(t *txn) error {
		j, err := t.job(jobID)
		if err != nil {
			return err
		}
		if err := t.release(j); err != nil {
			return err
		}
		// Drop it from the save list: it is deleted, not updated.
		delete(t.jobs, jobID)
		t.jobIDs = without(t.jobIDs, jobID)
		return s.st.DeleteJob(ctx, t.tx, jobID)
	})
	if err == nil {
		s.pub.Removed(jobID)
	}
	return err
}

func without(list []string, drop string) []string {
	out := list[:0]
	for _, v := range list {
		if v != drop {
			out = append(out, v)
		}
	}
	return out
}

// QuoteResult is the response of the quote endpoint.
type QuoteResult struct {
	Miles       float64            `json:"miles"`
	DurationMin int                `json:"durationMin"`
	Surge       bool               `json:"surge"`
	Quotes      []domain.FareQuote `json:"quotes"`
}

// Quote prices a route on every tariff. A surging pickup zone multiplies the price.
func (s *Service) Quote(ctx context.Context, pickup domain.Stop, vias []domain.Stop, dropoff *domain.Stop) (QuoteResult, error) {
	if dropoff == nil {
		return QuoteResult{}, invalid("dropoff is required for a quote")
	}
	points := []domain.LatLng{pickup.Point()}
	for _, v := range vias {
		points = append(points, v.Point())
	}
	points = append(points, dropoff.Point())
	miles := fleet.RouteMiles(points)
	surge := false
	if z, err := s.st.ZoneAt(ctx, s.st.DB, pickup.Point()); err == nil && z != nil {
		surge = z.Surge
	}
	mult := 1.0
	if surge {
		mult = fleet.SurgeMultiplier
	}
	return QuoteResult{Miles: miles, DurationMin: fleet.EtaMinutes(miles), Surge: surge, Quotes: fleet.QuoteFares(miles, mult)}, nil
}

// ClearZoneFlags turns off surge and fully-booked on every zone.
func (s *Service) ClearZoneFlags(ctx context.Context) error {
	off := false
	if err := s.st.SetZoneFlags(ctx, nil, &off, &off); err != nil {
		return err
	}
	return s.PublishZones(ctx)
}

func (s *Service) PublishZones(ctx context.Context) error {
	zones, err := s.st.Zones(ctx)
	if err != nil {
		return err
	}
	s.pub.Zones(zones)
	return nil
}

// IsNotFound reports whether err means the record does not exist.
func IsNotFound(err error) bool { return errors.Is(err, store.ErrNotFound) }
