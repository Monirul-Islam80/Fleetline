package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

// telephonyRoutes are webhooks from the phone system (Twilio, Amazon Connect, Aircall): the "cli" group
// pops the caller onto the consoles, and the "ivr" group answers automated phone flows.
func (s *Server) telephonyRoutes(g *gin.RouterGroup) {
	g.POST("/cli/pickup", s.callPickup)
	g.POST("/cli/hangup", s.callHangup)

	ivr := g.Group("/ivr")
	ivr.GET("/phonestate", s.phoneState)
	ivr.POST("/block", s.blockPhone(true))
	ivr.POST("/unblock", s.blockPhone(false))
	ivr.GET("/customer", s.lookupCustomer)
	ivr.GET("/driver", s.ivrDriverNumber)
	ivr.POST("/bookings", s.ivrBooking)
	ivr.GET("/addresses", s.customerAddresses)
	ivr.POST("/noshow/:id/approve", s.noShowDecision(true))
	ivr.POST("/noshow/:id/reject", s.noShowDecision(false))
}

// callerFields reads the caller number and call id from any of the providers' payloads,
// form-encoded (Twilio) or JSON (Aircall, Amazon Connect via Lambda).
func callerFields(c *gin.Context) (phone, callID string) {
	if strings.HasPrefix(c.ContentType(), "application/json") {
		var in map[string]any
		if body(c, &in) {
			phone = firstString(in, "phone", "from", "From", "caller", "raw_digits", "CustomerNumber")
			callID = firstString(in, "callId", "CallSid", "id", "ContactId")
			if data, ok := in["data"].(map[string]any); ok { // Aircall wraps the call in "data"
				phone = coalesce(phone, firstString(data, "raw_digits", "from"))
				callID = coalesce(callID, firstString(data, "id"))
			}
		}
	} else {
		phone = coalesce(c.PostForm("From"), c.PostForm("phone"), c.PostForm("caller"))
		callID = coalesce(c.PostForm("CallSid"), c.PostForm("callId"))
	}
	if callID == "" {
		callID = fleet.NewID("call")
	}
	return strings.TrimSpace(phone), callID
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		switch v := m[k].(type) {
		case string:
			if v != "" {
				return v
			}
		case float64:
			return strconv.FormatFloat(v, 'f', -1, 64)
		}
	}
	return ""
}

func coalesce(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// callPickup is the screen pop: the call and any matching customer go to every console.
func (s *Server) callPickup(c *gin.Context) {
	phone, callID := callerFields(c)
	if phone == "" {
		fail(c, http.StatusBadRequest, "bad_request", "caller number missing")
		return
	}
	customer, err := s.st.CustomerByPhone(c, phone)
	if err != nil {
		failErr(c, err)
		return
	}
	call := domain.IncomingCall{CallID: callID, Phone: phone, At: fleet.NowMillis(), Customer: customer}
	if err := s.st.InboxPut(c, s.st.DB, store.KindCall, callID, call.At, call); err != nil {
		failErr(c, err)
		return
	}
	s.pub.Call(call)
	c.JSON(http.StatusOK, call)
}

func (s *Server) callHangup(c *gin.Context) {
	phone, callID := callerFields(c)
	call := domain.IncomingCall{CallID: callID, Phone: phone, At: fleet.NowMillis(), Ended: true}
	_ = s.st.InboxPatch(c, store.KindCall, callID, map[string]any{"ended": true})
	s.pub.Call(call)
	c.JSON(http.StatusOK, call)
}

// phoneState tells an IVR flow how to treat a caller: blocked, known customer, booking in progress.
func (s *Server) phoneState(c *gin.Context) {
	phone := c.Query("phone")
	digits := fleet.Digits(phone)
	if len(digits) < 7 {
		fail(c, http.StatusBadRequest, "bad_request", "phone is required")
		return
	}
	_, blockedErr := s.st.GetResource(c, "blocked_phones", digits)
	customer, err := s.st.CustomerByPhone(c, phone)
	if err != nil {
		failErr(c, err)
		return
	}
	jobs, err := s.st.Jobs(c, s.st.DB, `regexp_replace(doc->>'phone','\D','','g') = $1 AND status <> ALL($2)`, digits, []string{domain.JobCompleted, domain.JobCancelled, domain.JobNoShow})
	if err != nil {
		failErr(c, err)
		return
	}
	var activeJob *domain.Job
	if len(jobs) > 0 {
		activeJob = &jobs[len(jobs)-1]
	}
	c.JSON(http.StatusOK, gin.H{"phone": phone, "blocked": blockedErr == nil, "customer": customer, "activeBooking": activeJob})
}

func (s *Server) blockPhone(block bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			Phone  string `json:"phone"`
			Reason string `json:"reason"`
		}
		if !body(c, &in) {
			return
		}
		digits := fleet.Digits(in.Phone)
		if len(digits) < 7 {
			fail(c, http.StatusBadRequest, "bad_request", "phone is required")
			return
		}
		if block {
			r, err := s.st.CreateResource(c, s.st.DB, "blocked_phones", "", map[string]any{"id": digits, "phone": in.Phone, "reason": in.Reason})
			created(c, r, err)
			return
		}
		err := s.st.DeleteResource(c, "blocked_phones", digits)
		if err == store.ErrNotFound {
			err = nil
		}
		noContent(c, err)
	}
}

// ivrDriverNumber gives the IVR the phone of the driver on a caller's booking, to connect them.
func (s *Server) ivrDriverNumber(c *gin.Context) {
	job, err := s.st.JobByRef(c, s.st.DB, c.Query("bookingId"))
	if err != nil {
		failErr(c, err)
		return
	}
	if job.DriverID == nil {
		fail(c, http.StatusNotFound, "not_found", "No driver on this booking yet")
		return
	}
	d, err := s.st.Driver(c, s.st.DB, *job.DriverID)
	ok(c, gin.H{"callsign": d.Callsign, "phone": d.Phone}, err)
}

// ivrBooking books from an IVR flow: a known caller picks one of their recent places, ASAP.
func (s *Server) ivrBooking(c *gin.Context) {
	var in struct {
		Phone      string `json:"phone"`
		PlaceID    string `json:"placeId"`
		Passengers int    `json:"passengers"`
	}
	if !body(c, &in) {
		return
	}
	customer, err := s.st.CustomerByPhone(c, in.Phone)
	if err != nil {
		failErr(c, err)
		return
	}
	if customer == nil {
		fail(c, http.StatusNotFound, "not_found", "Unknown caller")
		return
	}
	place, err := s.st.Place(c, in.PlaceID)
	if err != nil {
		failErr(c, err)
		return
	}
	stop := place.Stop()
	job, err := s.svc.CreateJob(c, domain.CreateJobInput{
		Pickup: &stop, Passengers: max(in.Passengers, 1), CustomerName: customer.Name, Phone: customer.Phone,
		Email: customer.Email, AccountCode: customer.AccountCode, Source: "PHONE", Instructions: "IVR BOOKING",
		Options: domain.BookingOptions{SendSMS: true},
	}, "IVR")
	created(c, job, err)
}

// customerAddresses is a caller's recent places, for "book from my usual address" flows.
func (s *Server) customerAddresses(c *gin.Context) {
	var customer *domain.Customer
	var err error
	if id := c.Param("id"); id != "" {
		var cust domain.Customer
		cust, err = s.st.Customer(c, id)
		customer = &cust
	} else {
		customer, err = s.st.CustomerByPhone(c, c.Query("phone"))
	}
	if err != nil {
		failErr(c, err)
		return
	}
	out := []domain.Place{}
	if customer != nil {
		for _, id := range customer.RecentPlaceIDs {
			if p, err := s.st.Place(c, id); err == nil {
				out = append(out, p)
			}
		}
	}
	c.JSON(http.StatusOK, out)
}

// noShowDecision approves or rejects a driver's no-show claim. Rejecting re-dispatches the booking.
func (s *Server) noShowDecision(approve bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		job, err := s.st.JobByRef(c, s.st.DB, c.Param("id"))
		if err != nil {
			failErr(c, err)
			return
		}
		decision := "approved"
		if !approve {
			decision = "rejected"
		}
		if _, err := s.st.CreateResource(c, s.st.DB, "noshow_decisions", job.ID, map[string]any{"id": job.ID, "decision": decision}); err != nil {
			failErr(c, err)
			return
		}
		if !approve && job.Status == domain.JobNoShow {
			job, err = s.svc.Action(c, job.ID, "reopen", "")
		}
		ok(c, gin.H{"booking": job, "decision": decision}, err)
	}
}
