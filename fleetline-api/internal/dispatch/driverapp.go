package dispatch

import (
	"context"
	"strings"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/live"
)

// Ping stores a driver's GPS position (the driver app sends one every 5 seconds) and pushes it to consoles.
// Postgres receives it later in a batch from FlushPositions.
func (s *Service) Ping(ctx context.Context, driverRef string, lat, lng float64) (domain.Driver, error) {
	d, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return d, err
	}
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return d, invalid("coordinates out of range")
	}
	now := fleet.NowMillis()
	if err := s.st.Live.Ping(ctx, d.ID, live.Position{Lat: lat, Lng: lng, At: now}); err != nil {
		return d, err
	}
	d.Lat, d.Lng, d.UpdatedAt = lat, lng, now
	s.pub.Driver(d.ID, map[string]any{"lat": lat, "lng": lng, "updatedAt": now})
	return d, nil
}

// DriverJobStatus moves the driver's current job along: ARRIVED, POB, DROPPINGOFF, COMPLETED or NOSHOW.
func (s *Service) DriverJobStatus(ctx context.Context, driverRef, status string) (domain.Job, error) {
	ref, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return domain.Job{}, err
	}
	status = strings.ToUpper(status)
	var out domain.Job
	err = s.run(ctx, func(t *txn) error {
		d, err := t.driver(ref.ID)
		if err != nil {
			return err
		}
		if d.CurrentJobID == nil {
			return conflict("%s has no current job", d.Callsign)
		}
		j, err := t.job(*d.CurrentJobID)
		if err != nil {
			return err
		}
		next := map[string][]string{
			domain.JobArrived:     {domain.JobEnroute},
			domain.JobPOB:         {domain.JobArrived, domain.JobEnroute},
			domain.JobDroppingOff: {domain.JobPOB},
			domain.JobCompleted:   {domain.JobPOB, domain.JobDroppingOff, domain.JobArrived},
			domain.JobNoShow:      {domain.JobArrived},
		}
		allowed, known := next[status]
		if !known {
			return invalid("unknown trip status %q", status)
		}
		if !contains(allowed, j.Status) {
			return conflict("cannot go from %s to %s", j.Status, status)
		}
		switch status {
		case domain.JobArrived:
			t.setJobStatus(j, domain.JobArrived)
			t.event(j.ID, "STATUS", "Arrived at pickup")
			t.setDriverStatus(d, domain.DriverArrived)
			d.Target = nil
		case domain.JobPOB:
			t.setJobStatus(j, domain.JobPOB)
			t.event(j.ID, "STATUS", "Passenger on board")
			t.setDriverStatus(d, domain.DriverPOB)
			if j.Dropoff != nil {
				d.Target = &domain.LatLng{Lat: j.Dropoff.Lat, Lng: j.Dropoff.Lng}
			}
		case domain.JobDroppingOff:
			t.setJobStatus(j, domain.JobDroppingOff)
			t.event(j.ID, "STATUS", "Approaching drop-off")
			t.setDriverStatus(d, domain.DriverDropping)
		case domain.JobCompleted:
			t.setJobStatus(j, domain.JobCompleted)
			t.event(j.ID, "STATUS", "Completed")
			s.freeAfterTrip(t, d)
		case domain.JobNoShow:
			t.setJobStatus(j, domain.JobNoShow)
			t.event(j.ID, "NOSHOW", "Passenger did not show")
			t.alert("NOSHOW", "NOSHOW "+d.Callsign+" ("+j.CustomerName+")",
				strings.ToUpper(j.Pickup.Label)+", "+strings.ToUpper(j.Pickup.Area), fleet.Ptr(j.ID), fleet.Ptr(d.Callsign))
			s.freeAfterTrip(t, d)
		}
		out = *j
		return nil
	})
	if err == nil && (status == domain.JobCompleted || status == domain.JobNoShow) {
		s.Nudge()
	}
	return out, err
}

func (s *Service) freeAfterTrip(t *txn, d *domain.Driver) {
	t.setDriverStatus(d, domain.DriverAvailable)
	d.CurrentJobID = nil
	d.Target = nil
	if z, err := s.st.ZoneAt(t.ctx, t.tx, d.Point()); err == nil && z != nil {
		d.ZoneID = fleet.Ptr(z.ID)
	}
}

// SetPresence is the driver app's log on, park and log off: AVAILABLE, PARKED or AWAY.
func (s *Service) SetPresence(ctx context.Context, driverRef, status string) (domain.Driver, error) {
	ref, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return ref, err
	}
	status = strings.ToUpper(status)
	if status != domain.DriverAvailable && status != domain.DriverParked && status != domain.DriverAway {
		return ref, invalid("presence must be AVAILABLE, PARKED or AWAY")
	}
	var out domain.Driver
	err = s.run(ctx, func(t *txn) error {
		d, err := t.driver(ref.ID)
		if err != nil {
			return err
		}
		if !domain.Dispatchable[d.Status] && d.Status != domain.DriverAway {
			return conflict("%s is busy (%s)", d.Callsign, d.Status)
		}
		if status == domain.DriverAway && d.Status != domain.DriverAway {
			t.alert("DRIVER_LOGOUT", "DRIVER LOGOUT", d.Callsign+" "+strings.ToUpper(d.Name)+" has logged out", nil, fleet.Ptr(d.Callsign))
		}
		if status == domain.DriverParked {
			if z, err := s.st.ZoneAt(ctx, t.tx, d.Point()); err == nil && z != nil {
				d.ZoneID = fleet.Ptr(z.ID)
			}
		}
		t.setDriverStatus(d, status)
		out = *d
		return nil
	})
	if err == nil && status != domain.DriverAway {
		s.Nudge()
	}
	return out, err
}

// CurrentJob returns the job a driver is on, or holds an offer for.
func (s *Service) CurrentJob(ctx context.Context, driverRef string) (*domain.Job, error) {
	d, err := s.st.DriverByRef(ctx, s.st.DB, driverRef)
	if err != nil {
		return nil, err
	}
	if d.CurrentJobID != nil {
		j, err := s.st.Job(ctx, s.st.DB, *d.CurrentJobID)
		if err != nil {
			return nil, err
		}
		return &j, nil
	}
	offered, err := s.st.Jobs(ctx, s.st.DB, `status = $1 AND doc->'offer'->>'driverId' = $2`, domain.JobNew, d.ID)
	if err != nil || len(offered) == 0 {
		return nil, err
	}
	return &offered[0], nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
