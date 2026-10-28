package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/live"
	"fleetline/api/internal/store"
)

const editLockTTL = 2 * time.Minute

// bookingRoutes is the "bookings" group of the endpoint list, with real logic behind every route.
func (s *Server) bookingRoutes(g *gin.RouterGroup) {
	b := g.Group("/bookings")
	b.POST("/add/complex", s.addBooking("complex"))
	b.POST("/add/vias", s.addBooking("vias"))
	b.POST("/check", s.checkBooking)
	b.GET("/upcoming", s.listBookings(upcoming, false))
	b.GET("/upcoming/slim", s.listBookings(upcoming, true))
	b.GET("/active", s.listBookings(active, false))
	b.GET("/history", s.searchBookings)
	b.GET("/nearby", s.nearbyBookings)
	b.POST("/passengers", s.passengersFromBookings)

	one := b.Group("/:id")
	one.GET("", s.getBooking)
	one.PATCH("", s.updateBooking)
	one.DELETE("", s.deleteBooking)
	one.POST("/status", s.bookingStatus)
	one.POST("/cancel", s.bookingAction("cancel"))
	one.POST("/complete", s.bookingAction("complete"))
	one.POST("/pause", s.bookingAction("pause"))
	one.POST("/unpause", s.bookingAction("resume"))
	one.POST("/dispatch", s.dispatchBooking)
	one.POST("/backtobase", s.backToBase)
	one.POST("/hired", s.hired)
	one.POST("/lock", s.lockBooking)
	one.DELETE("/lock", s.unlockBooking)
	one.GET("/tripsheet", s.tripSheet)
	one.GET("/events", s.bookingEvents)
	one.GET("/exclusions", s.exclusions)
	one.GET("/recurring", s.recurring)
	one.POST("/payment", s.record("booking_payments", "id"))
	one.PATCH("/payment", s.bookingPayment)
	one.GET("/notes", s.listRes("booking_notes", "id"))
	one.POST("/notes", s.addNote)
	one.POST("/receipt", s.record("receipts", "id"))
	one.GET("/receipts", s.listRes("receipts", "id"))
	one.POST("/rating", s.record("customer_ratings", "id"))
	one.POST("/accountfields/validate", s.validateAccountFields)
	one.GET("/transactions", s.listRes("booking_transactions", "id"))
	one.POST("/transactions", s.createRes("booking_transactions", "id"))
	one.GET("/transactions/:txId", s.getRes("booking_transactions", "txId"))
	one.PATCH("/transactions/:txId", s.updateRes("booking_transactions", "txId"))
}

// addBooking creates a booking. "basic" is the console's form; "vias" requires at least one via;
// "complex" also accepts several taxis, each booked as its own job.
func (s *Server) addBooking(variant string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in domain.CreateJobInput
		if !body(c, &in) {
			return
		}
		p := principal(c)
		createdBy := s.operatorName(c)
		switch p.Kind {
		case "driver":
			fail(c, http.StatusForbidden, "forbidden", "Drivers cannot create bookings")
			return
		case "user":
			customer, err := s.st.Customer(c, p.ID)
			if err != nil {
				failErr(c, err)
				return
			}
			in.Source, in.Phone, in.CustomerName, in.Payment = "APP", customer.Phone, customer.Name, "CARD"
			in.DesignatedCallsign, in.OperatorNotes, in.FareOverridden = nil, "", false
			createdBy = "Passenger app"
		}
		if variant == "vias" && len(in.Vias) == 0 {
			fail(c, http.StatusUnprocessableEntity, "invalid", "add at least one via")
			return
		}
		taxis := max(in.Taxis, 1)
		if variant != "complex" || taxis == 1 {
			job, err := s.svc.CreateJob(c, in, createdBy)
			created(c, job, err)
			return
		}
		jobs := []domain.Job{}
		in.Taxis = 1
		for i := 0; i < taxis && i < 20; i++ {
			job, err := s.svc.CreateJob(c, in, createdBy)
			if err != nil {
				failErr(c, err)
				return
			}
			jobs = append(jobs, job)
		}
		c.JSON(http.StatusCreated, jobs)
	}
}

// checkBooking validates a booking and prices it without saving ("Check Booking (Basic)").
func (s *Server) checkBooking(c *gin.Context) {
	var in domain.CreateJobInput
	if !body(c, &in) {
		return
	}
	problems := []string{}
	if in.Pickup == nil {
		problems = append(problems, "pickup is required")
	}
	if strings.TrimSpace(in.CustomerName) == "" && strings.TrimSpace(in.Phone) == "" {
		problems = append(problems, "name or phone is required")
	}
	if v, ok := fleet.Vehicles[in.Vehicle]; in.Vehicle != "" && (!ok || in.Passengers > v.Seats) {
		problems = append(problems, "vehicle cannot take that many passengers")
	}
	if in.PickupAt != 0 && in.PickupAt < fleet.NowMillis()-5*60_000 {
		problems = append(problems, "pickup time has passed")
	}
	out := gin.H{"valid": len(problems) == 0, "problems": problems}
	if in.Pickup != nil && in.Dropoff != nil {
		if quote, err := s.svc.Quote(c, *in.Pickup, in.Vias, in.Dropoff); err == nil {
			out["quote"] = quote
		}
	}
	if in.Pickup != nil {
		if near, err := s.st.NearestDrivers(c, s.st.DB, in.Pickup.Point(), max(in.Passengers, 1), in.ExcludeDrivers, 1); err == nil && len(near) > 0 {
			miles := near[0].Metres * 1.3 / 1609.344
			out["nearestDriver"] = gin.H{"callsign": near[0].Callsign, "miles": miles, "etaMin": fleet.EtaMinutes(miles)}
		}
	}
	c.JSON(http.StatusOK, out)
}

type listKind int

const (
	upcoming listKind = iota
	active
)

// listBookings is "List Upcoming Bookings" (pre-booked and waiting) and "List Active Bookings" (on a trip).
func (s *Server) listBookings(kind listKind, slim bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		statuses := []string{domain.JobBooked, domain.JobNew, domain.JobPaused, domain.JobBidding}
		if kind == active {
			statuses = []string{domain.JobEnroute, domain.JobArrived, domain.JobPOB, domain.JobDroppingOff}
		}
		jobs, err := s.st.Jobs(c, s.st.DB, `status = ANY($1)`, statuses)
		if err != nil || !slim {
			ok(c, jobs, err)
			return
		}
		type slimJob struct {
			ID       string        `json:"id"`
			Number   int64         `json:"number"`
			Status   string        `json:"status"`
			PickupAt domain.Millis `json:"pickupAt"`
			Pickup   string        `json:"pickup"`
			Customer string        `json:"customerName"`
		}
		out := make([]slimJob, 0, len(jobs))
		for _, j := range jobs {
			out = append(out, slimJob{j.ID, j.Number, j.Status, j.PickupAt, j.Pickup.Label + ", " + j.Pickup.Area, j.CustomerName})
		}
		c.JSON(http.StatusOK, out)
	}
}

func (s *Server) nearbyBookings(c *gin.Context) {
	lat, lng, good := latLng(c)
	if !good {
		return
	}
	radius, _ := qFloat(c, "radiusM")
	if radius <= 0 || radius > 50_000 {
		radius = 3_000
	}
	jobs, err := s.st.NearbyJobs(c, domain.LatLng{Lat: lat, Lng: lng}, radius, min(max(qInt(c, "limit", 20), 1), 100))
	ok(c, jobs, err)
}

func (s *Server) getBooking(c *gin.Context) {
	job, err := s.st.JobByRef(c, s.st.DB, c.Param("id"))
	ok(c, job, err)
}

// updateBooking edits a booking. If another operator holds the edit lock, the edit is refused.
func (s *Server) updateBooking(c *gin.Context) {
	patch, good := object(c)
	if !good {
		return
	}
	if owner := s.st.Live.LockOwner(c, "booking:"+c.Param("id")); owner != "" && owner != s.operatorName(c) {
		fail(c, http.StatusConflict, "locked", "Being edited by "+owner)
		return
	}
	job, err := s.svc.UpdateJob(c, c.Param("id"), patch)
	ok(c, job, err)
}

func (s *Server) deleteBooking(c *gin.Context) {
	noContent(c, s.svc.DeleteJob(c, c.Param("id")))
}

func (s *Server) bookingAction(action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		job, err := s.svc.Action(c, c.Param("id"), action, "")
		ok(c, job, err)
	}
}

// bookingStatus is "Update the status of a booking": {"status": "NEW" | "PAUSED" | "CANCELLED" | "NOSHOW" | "COMPLETED"}.
// NEW on a live job re-dispatches it.
func (s *Server) bookingStatus(c *gin.Context) {
	var in struct {
		Status string `json:"status"`
	}
	if !body(c, &in) {
		return
	}
	action, known := map[string]string{
		domain.JobNew: "redispatch", domain.JobPaused: "pause", domain.JobCancelled: "cancel",
		domain.JobNoShow: "noshow", domain.JobCompleted: "complete",
	}[strings.ToUpper(in.Status)]
	if !known {
		fail(c, http.StatusUnprocessableEntity, "invalid", "status must be NEW, PAUSED, CANCELLED, NOSHOW or COMPLETED")
		return
	}
	if strings.ToUpper(in.Status) == domain.JobNew {
		if job, err := s.st.Job(c, s.st.DB, c.Param("id")); err == nil && job.Status == domain.JobPaused {
			action = "resume"
		}
	}
	job, err := s.svc.Action(c, c.Param("id"), action, "")
	ok(c, job, err)
}

// dispatchBooking is manual allocation: {"callsign": "143"} (driver id also accepted).
func (s *Server) dispatchBooking(c *gin.Context) {
	var in struct {
		Callsign string `json:"callsign"`
		DriverID string `json:"driverId"`
	}
	if !body(c, &in) {
		return
	}
	ref := in.Callsign
	if ref == "" {
		ref = in.DriverID
	}
	if strings.TrimSpace(ref) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "callsign is required")
		return
	}
	job, err := s.svc.Action(c, c.Param("id"), "assign", ref)
	ok(c, job, err)
}

// backToBase returns a job to the dispatch queue and frees its driver ("Back to Base Booking Action").
func (s *Server) backToBase(c *gin.Context) {
	job, err := s.svc.Action(c, c.Param("id"), "redispatch", "")
	ok(c, job, err)
}

// hired is the meter starting: the passenger is on board.
func (s *Server) hired(c *gin.Context) {
	job, err := s.st.Job(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	if job.DriverID == nil {
		fail(c, http.StatusConflict, "conflict", "Booking has no driver")
		return
	}
	job, err = s.svc.DriverJobStatus(c, *job.DriverID, domain.JobPOB)
	ok(c, job, err)
}

func (s *Server) lockBooking(c *gin.Context) {
	owner, err := s.st.Live.Lock(c, "booking:"+c.Param("id"), s.operatorName(c), editLockTTL)
	if err == live.ErrLocked {
		fail(c, http.StatusConflict, "locked", "Being edited by "+owner)
		return
	}
	ok(c, gin.H{"lockedBy": owner, "expiresInMs": editLockTTL.Milliseconds()}, err)
}

func (s *Server) unlockBooking(c *gin.Context) {
	noContent(c, s.st.Live.Unlock(c, "booking:"+c.Param("id"), s.operatorName(c)))
}

// tripSheet is the job with its timeline, driver and fare: what a printed trip sheet shows.
func (s *Server) tripSheet(c *gin.Context) {
	job, err := s.st.JobByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	events, err := s.st.Events(c, job.ID)
	if err != nil {
		failErr(c, err)
		return
	}
	sheet := gin.H{"job": job, "events": events, "driver": nil}
	if job.DriverID != nil {
		if d, err := s.st.Driver(c, s.st.DB, *job.DriverID); err == nil {
			sheet["driver"] = gin.H{"callsign": d.Callsign, "name": d.Name, "plate": d.Plate, "badge": d.Badge}
		}
	}
	c.JSON(http.StatusOK, sheet)
}

// bookingEvents is "Listen For Events": the job's timeline. Pass ?since=<ms> to poll for new ones.
// Live listeners should use the WebSocket instead.
func (s *Server) bookingEvents(c *gin.Context) {
	events, err := s.st.Events(c, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	since := qInt64(c, "since", 0)
	out := []domain.JobEvent{}
	for _, e := range events {
		if e.At > since {
			out = append(out, e)
		}
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) exclusions(c *gin.Context) {
	job, err := s.st.Job(c, s.st.DB, c.Param("id"))
	ok(c, gin.H{"excludeDrivers": job.ExcludeDrivers, "missedBy": job.MissedBy}, err)
}

// recurring lists the other bookings in the same recurring series (same customer, pickup and time of day).
func (s *Server) recurring(c *gin.Context) {
	job, err := s.st.Job(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	if !job.IsRecurring {
		c.JSON(http.StatusOK, []domain.Job{})
		return
	}
	jobs, err := s.st.Jobs(c, s.st.DB, `id <> $1 AND doc->>'phone' = $2 AND doc->'pickup'->>'label' = $3 AND (doc->>'isRecurring')::boolean`, job.ID, job.Phone, job.Pickup.Label)
	ok(c, jobs, err)
}

// bookingPayment changes how a booking is paid: {"payment": "CASH" | "CARD" | "ACCOUNT", "accountCode"?, "fare"?}.
func (s *Server) bookingPayment(c *gin.Context) {
	var in struct {
		Payment     string   `json:"payment"`
		AccountCode *string  `json:"accountCode"`
		Fare        *float64 `json:"fare"`
	}
	if !body(c, &in) {
		return
	}
	patch := map[string]any{}
	if in.Payment != "" {
		p := strings.ToUpper(in.Payment)
		if p != "CASH" && p != "CARD" && p != "ACCOUNT" {
			fail(c, http.StatusUnprocessableEntity, "invalid", "payment must be CASH, CARD or ACCOUNT")
			return
		}
		patch["payment"] = p
	}
	if in.AccountCode != nil {
		patch["accountCode"] = *in.AccountCode
	}
	if in.Fare != nil {
		patch["fare"] = *in.Fare
		patch["fareOverridden"] = true
	}
	job, err := s.svc.UpdateJob(c, c.Param("id"), patch)
	ok(c, job, err)
}

// addNote stores a note and appends it to the booking's operator notes.
func (s *Server) addNote(c *gin.Context) {
	var in struct {
		Text string `json:"text"`
	}
	if !body(c, &in) {
		return
	}
	if strings.TrimSpace(in.Text) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "text is required")
		return
	}
	job, err := s.st.Job(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	note, err := s.st.CreateResource(c, s.st.DB, "booking_notes", job.ID, map[string]any{"text": in.Text, "by": s.operatorName(c)})
	if err != nil {
		failErr(c, err)
		return
	}
	notes := strings.TrimSpace(job.OperatorNotes + "\n" + in.Text)
	if _, err := s.svc.UpdateJob(c, job.ID, map[string]any{"operatorNotes": notes}); err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, note)
}

// validateAccountFields checks a booking's account against the account's required fields.
func (s *Server) validateAccountFields(c *gin.Context) {
	values, good := object(c)
	if !good {
		return
	}
	job, err := s.st.Job(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	if job.AccountCode == nil {
		c.JSON(http.StatusOK, gin.H{"valid": true, "missing": []string{}})
		return
	}
	s.checkAccountFields(c, *job.AccountCode, values)
}

func (s *Server) checkAccountFields(c *gin.Context, accountCode string, values map[string]any) {
	fields, _, err := s.st.ListResources(c, "accountfields", store.ResourceQuery{ParentID: accountCode, Limit: 200})
	if err != nil {
		failErr(c, err)
		return
	}
	missing := []string{}
	for _, f := range fields {
		name, _ := f["name"].(string)
		required, _ := f["required"].(bool)
		if v, present := values[name]; required && (!present || v == "" || v == nil) {
			missing = append(missing, name)
		}
	}
	c.JSON(http.StatusOK, gin.H{"valid": len(missing) == 0, "missing": missing})
}

// passengersFromBookings returns the passengers on a list of bookings or a journey: {"bookingIds": [...]} or {"journeyId": "..."}.
func (s *Server) passengersFromBookings(c *gin.Context) {
	var in struct {
		BookingIDs []string `json:"bookingIds"`
		JourneyID  string   `json:"journeyId"`
	}
	if !body(c, &in) {
		return
	}
	ids := in.BookingIDs
	if in.JourneyID != "" {
		journey, err := s.st.GetResource(c, "journeys", in.JourneyID)
		if err != nil {
			failErr(c, err)
			return
		}
		ids = stringList(journey["bookingIds"])
	}
	jobs, err := s.st.Jobs(c, s.st.DB, `id = ANY($1)`, ids)
	if err != nil {
		failErr(c, err)
		return
	}
	out := []gin.H{}
	for _, j := range jobs {
		out = append(out, gin.H{"bookingId": j.ID, "name": j.CustomerName, "phone": j.Phone, "passengers": j.Passengers, "pickup": j.Pickup, "dropoff": j.Dropoff})
	}
	c.JSON(http.StatusOK, out)
}

func stringList(v any) []string {
	out := []string{}
	if list, ok := v.([]any); ok {
		for _, x := range list {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}
