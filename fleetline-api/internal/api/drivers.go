package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

const tokenTTL = 12 * time.Hour

// driverAppRoutes are what the driver app calls. :id is the driver id (callsigns work for operators).
func (s *Server) driverAppRoutes(g *gin.RouterGroup) {
	g.POST("/location", s.driverPing)     // every 5 s
	g.POST("/offer", s.driverOffer)       // {"bookingId", "accept": true|false}
	g.POST("/trip", s.driverTrip)         // {"status": "ARRIVED" | "POB" | "DROPPINGOFF" | "COMPLETED" | "NOSHOW"}
	g.POST("/presence", s.driverPresence) // {"status": "AVAILABLE" | "PARKED" | "AWAY"}
	g.POST("/bid", s.driverBid)           // {"bookingId"}
	g.GET("/booking", s.driverBooking)    // Get Booking From Driver ID/Ref
	g.GET("/messages", s.listRes("driver_messages", "id"))
}

// driverRoutes is the operator side of the "drivers" group.
func (s *Server) driverRoutes(g *gin.RouterGroup) {
	d := g.Group("/drivers")
	d.GET("", s.searchDrivers)                     // Get All Drivers (and the console's Drivers view)
	d.POST("", s.createDriver)                     // Create Driver
	d.GET("/locations", s.driverLocations)         // Driver Locations
	d.GET("/multiple", s.multipleDrivers)          // Retrieve Driver Info for Multiple Drivers
	d.GET("/byplate", s.driversByPlate)            // Find Drivers By Plate
	d.GET("/sites", s.listRes("driver_sites", "")) // Get All Driver Sites
	d.GET("/tracks", s.driverTracks)               // console playback
	d.GET("/ref/:id", s.driverRef)                 // Get Driver Ref (from id)
	d.GET("/id/:id", s.driverID)                   // Get Driver Id (from ref)

	one := d.Group("/:id")
	one.GET("", s.getDriver)
	one.PATCH("", s.updateDriver)
	one.POST("/activate", s.setDriverActive(true))
	one.POST("/deactivate", s.setDriverActive(false))
	one.GET("/attributes", s.getOne("driver_attributes", "id"))
	one.POST("/attributes", s.putOne("driver_attributes", "id"))
	one.GET("/balance", s.driverBalance)
	one.GET("/sites", s.listRes("driver_sites", "id"))
	one.POST("/sites", s.link("driver_sites", "id", "siteId"))
	one.DELETE("/sites/:siteId", s.unlink("driver_sites", "id", "siteId", "siteId"))
	one.GET("/dispatchlicences", s.listRes("driver_licences", "id"))
	one.POST("/dispatchlicences", s.link("driver_licences", "id", "licenceId"))
	one.DELETE("/dispatchlicences/:licenceId", s.unlink("driver_licences", "id", "licenceId", "licenceId"))
	one.POST("/wallet", s.driverTransaction("credit"))
	one.GET("/customfields", s.getOne("driver_customfields", "id"))
	one.POST("/customfields", s.putOne("driver_customfields", "id"))
	one.PATCH("/customfields", s.updateRes("driver_customfields", "id"))
	one.DELETE("/customfields", s.deleteOne("driver_customfields", "id"))
	one.GET("/hours", s.driverHours)
	one.GET("/activities", s.driverActivities)
	one.GET("/dispatchshifts", s.listRes("dispatch_shifts", "id"))
	one.GET("/dispatchshifts/:shiftId", s.getRes("dispatch_shifts", "shiftId"))
	one.GET("/metershifts", s.listRes("meter_shifts", "id"))
	one.GET("/metershifts/:shiftId", s.getRes("meter_shifts", "shiftId"))
	one.POST("/message", s.messageDriver)
	one.GET("/items", s.listRes("driver_items", "id"))
	one.POST("/items", s.createRes("driver_items", "id"))
	one.GET("/ratings", s.listRes("driver_ratings", "id"))
	one.POST("/ratings", s.record("driver_ratings", "id"))
	one.POST("/events", s.record("driver_app_events", "id"))
	one.GET("/transactions/balance", s.driverBalance)
	one.POST("/transactions/add", s.driverTransaction("credit"))
	one.POST("/transactions/deduct", s.driverTransaction("debit"))
}

/* ---------- Driver app ---------- */

func (s *Server) driverPing(c *gin.Context) {
	var in struct {
		Lat *float64 `json:"lat"`
		Lng *float64 `json:"lng"`
	}
	if !body(c, &in) {
		return
	}
	if in.Lat == nil || in.Lng == nil {
		fail(c, http.StatusBadRequest, "bad_request", "lat and lng are required")
		return
	}
	_, err := s.svc.Ping(c, c.Param("id"), *in.Lat, *in.Lng)
	noContent(c, err)
}

func (s *Server) driverOffer(c *gin.Context) {
	var in struct {
		BookingID string `json:"bookingId"`
		Accept    *bool  `json:"accept"`
	}
	if !body(c, &in) {
		return
	}
	if in.BookingID == "" || in.Accept == nil {
		fail(c, http.StatusBadRequest, "bad_request", "bookingId and accept are required")
		return
	}
	noContent(c, s.svc.Respond(c, c.Param("id"), in.BookingID, *in.Accept))
}

func (s *Server) driverTrip(c *gin.Context) {
	var in struct {
		Status string `json:"status"`
	}
	if !body(c, &in) {
		return
	}
	job, err := s.svc.DriverJobStatus(c, c.Param("id"), in.Status)
	ok(c, job, err)
}

func (s *Server) driverPresence(c *gin.Context) {
	var in struct {
		Status string `json:"status"`
	}
	if !body(c, &in) {
		return
	}
	d, err := s.svc.SetPresence(c, c.Param("id"), in.Status)
	ok(c, d, err)
}

func (s *Server) driverBid(c *gin.Context) {
	var in struct {
		BookingID string `json:"bookingId"`
	}
	if !body(c, &in) {
		return
	}
	noContent(c, s.svc.Bid(c, in.BookingID, c.Param("id")))
}

func (s *Server) driverBooking(c *gin.Context) {
	job, err := s.svc.CurrentJob(c, c.Param("id"))
	ok(c, job, err)
}

/* ---------- Operator side ---------- */

func (s *Server) getDriver(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	ok(c, d, err)
}

func (s *Server) driverRef(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	ok(c, gin.H{"id": d.ID, "ref": d.Callsign}, err)
}

func (s *Server) driverID(c *gin.Context) { s.driverRef(c) }

// createDriver adds a driver. New drivers start AWAY until they log on in the app.
func (s *Server) createDriver(c *gin.Context) {
	var d domain.Driver
	if !body(c, &d) {
		return
	}
	d.Callsign = strings.TrimSpace(d.Callsign)
	if d.Callsign == "" || strings.TrimSpace(d.Name) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "callsign and name are required")
		return
	}
	if _, err := s.st.DriverByRef(c, s.st.DB, d.Callsign); err == nil {
		fail(c, http.StatusConflict, "conflict", "Callsign "+d.Callsign+" is taken")
		return
	}
	v, known := fleet.Vehicles[d.Vehicle]
	if !known {
		d.Vehicle, v = "SALOON", fleet.Vehicles["SALOON"]
	}
	now := fleet.NowMillis()
	d.ID = fleet.NewID("drv")
	d.Seats = max(d.Seats, v.Seats)
	d.Status, d.StatusSince, d.UpdatedAt = domain.DriverAway, now, now
	d.CurrentJobID, d.Target = nil, nil
	if d.SiteID == "" {
		d.SiteID = "wc"
	}
	if d.Lat == 0 && d.Lng == 0 {
		d.Lat, d.Lng = 51.1255, -0.011
	}
	if err := s.st.SaveDriver(c, s.st.DB, d); err != nil {
		failErr(c, err)
		return
	}
	s.pub.DriverFull(d)
	c.JSON(http.StatusCreated, d)
}

// updateDriver edits profile fields. Status and job links change only through the driver app and dispatch.
func (s *Server) updateDriver(c *gin.Context) {
	patch, good := object(c)
	if !good {
		return
	}
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	editable := map[string]bool{"name": true, "phone": true, "plate": true, "badge": true, "appVersion": true, "siteId": true, "vehicle": true, "seats": true}
	fields := map[string]any{}
	for k, v := range patch {
		if !editable[k] {
			fail(c, http.StatusUnprocessableEntity, "invalid", "field "+k+" cannot be edited here")
			return
		}
		fields[k] = v
	}
	merged := mergeStruct(d, fields)
	if _, known := fleet.Vehicles[merged.Vehicle]; !known {
		fail(c, http.StatusUnprocessableEntity, "invalid", "unknown vehicle "+merged.Vehicle)
		return
	}
	merged.UpdatedAt = fleet.NowMillis()
	if err := s.st.SaveDriver(c, s.st.DB, merged); err != nil {
		failErr(c, err)
		return
	}
	s.pub.DriverFull(merged)
	c.JSON(http.StatusOK, merged)
}

func (s *Server) setDriverActive(active bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
		if err != nil {
			failErr(c, err)
			return
		}
		if !active && !domain.Dispatchable[d.Status] && d.Status != domain.DriverAway {
			fail(c, http.StatusConflict, "conflict", d.Callsign+" is on a job")
			return
		}
		if err := s.st.SetDriverActive(c, d.ID, active); err != nil {
			failErr(c, err)
			return
		}
		if !active {
			if _, err := s.svc.SetPresence(c, d.ID, domain.DriverAway); err != nil && d.Status != domain.DriverAway {
				failErr(c, err)
				return
			}
			s.st.Live.Forget(c, d.ID)
		}
		c.JSON(http.StatusOK, gin.H{"id": d.ID, "active": active})
	}
}

func (s *Server) driverLocations(c *gin.Context) {
	list, err := s.st.Drivers(c, s.st.DB, "active")
	if err != nil {
		failErr(c, err)
		return
	}
	out := make([]gin.H, 0, len(list))
	for _, d := range list {
		out = append(out, gin.H{"id": d.ID, "callsign": d.Callsign, "lat": d.Lat, "lng": d.Lng, "status": d.Status, "updatedAt": d.UpdatedAt})
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) multipleDrivers(c *gin.Context) {
	refs := qList(c, "ids")
	if len(refs) == 0 {
		fail(c, http.StatusBadRequest, "bad_request", "ids is required, e.g. ?ids=d1,d2 or callsigns")
		return
	}
	list, err := s.st.Drivers(c, s.st.DB, `id = ANY($1) OR callsign = ANY($1)`, refs)
	ok(c, list, err)
}

func (s *Server) driversByPlate(c *gin.Context) {
	plate := strings.ReplaceAll(strings.ToUpper(c.Query("plate")), " ", "")
	if plate == "" {
		fail(c, http.StatusBadRequest, "bad_request", "plate is required")
		return
	}
	list, err := s.st.Drivers(c, s.st.DB, `replace(upper(doc->>'plate'), ' ', '') LIKE '%' || $1 || '%'`, plate)
	ok(c, list, err)
}

// driverTransaction credits or debits a driver's account. Amounts are positive; the kind sets the sign.
func (s *Server) driverTransaction(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in struct {
			Amount      float64 `json:"amount"`
			Description string  `json:"description"`
		}
		if !body(c, &in) {
			return
		}
		if in.Amount <= 0 {
			fail(c, http.StatusUnprocessableEntity, "invalid", "amount must be positive")
			return
		}
		d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
		if err != nil {
			failErr(c, err)
			return
		}
		amount := in.Amount
		if kind == "debit" {
			amount = -amount
		}
		tx, err := s.st.CreateResource(c, s.st.DB, "driver_transactions", d.ID, map[string]any{"amount": amount, "kind": kind, "description": in.Description, "by": s.operatorName(c)})
		created(c, tx, err)
	}
}

func (s *Server) driverBalance(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	var balance float64
	err = s.st.DB.GetContext(c, &balance, `SELECT coalesce(sum((data->>'amount')::numeric), 0) FROM resources WHERE kind = 'driver_transactions' AND parent_id = $1`, d.ID)
	ok(c, gin.H{"driverId": d.ID, "callsign": d.Callsign, "balance": balance}, err)
}

// driverHours sums time on trips today from the job timeline (accepted to completed).
func (s *Server) driverHours(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	from, to := fleet.DayRangeAt(qInt64(c, "day", fleet.NowMillis()))
	var row struct {
		Jobs int     `db:"jobs"`
		Ms   float64 `db:"ms"`
	}
	err = s.st.DB.GetContext(c, &row, `
		SELECT count(*) AS jobs, coalesce(sum(greatest(j.updated_at - (j.doc->>'pickupAt')::bigint, 0)), 0) AS ms
		FROM jobs j WHERE j.driver_id = $1 AND j.status = 'COMPLETED' AND j.pickup_at BETWEEN $2 AND $3`, d.ID, from, to)
	ok(c, gin.H{"driverId": d.ID, "jobs": row.Jobs, "hoursOnTrips": row.Ms / 3_600_000}, err)
}

// driverActivities is the driver's slice of the activity log.
func (s *Server) driverActivities(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	from, to := fleet.DayRangeAt(qInt64(c, "day", fleet.NowMillis()))
	list, err := s.st.Logs(c, store.LogFilter{From: from, To: to, Driver: d.Callsign, Categories: []string{"SYSTEM", "DRIVER", "OPERATOR"}})
	ok(c, list, err)
}

// messageDriver queues a message for one driver's app.
func (s *Server) messageDriver(c *gin.Context) {
	var in struct {
		Message string `json:"message"`
	}
	if !body(c, &in) {
		return
	}
	if strings.TrimSpace(in.Message) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "message is required")
		return
	}
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	m, err := s.st.CreateResource(c, s.st.DB, "driver_messages", d.ID, map[string]any{"message": in.Message, "from": s.operatorName(c), "read": false})
	created(c, m, err)
}

/* ---------- Sign-in ---------- */

// authenticateDriver signs a driver in with callsign and PIN and returns a bearer token for the driver app.
// The PIN is a single demo value (DEMO_DRIVER_PIN) until per-driver credentials exist.
func (s *Server) authenticateDriver(c *gin.Context) {
	var in struct {
		Callsign string `json:"callsign"`
		PIN      string `json:"pin"`
	}
	if !body(c, &in) {
		return
	}
	d, err := s.st.DriverByRef(c, s.st.DB, in.Callsign)
	if err != nil || in.PIN != s.cfg.DriverPIN {
		fail(c, http.StatusUnauthorized, "unauthorized", "Wrong callsign or PIN")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": s.tokens.issue("driver", d.ID, tokenTTL), "driver": d})
}

// authenticateUser signs a passenger in by phone and code. The code is a demo value (DEMO_USER_CODE)
// until SMS verification is connected. Unknown numbers become new customers.
func (s *Server) authenticateUser(c *gin.Context) {
	var in struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
		Name  string `json:"name"`
	}
	if !body(c, &in) {
		return
	}
	if len(fleet.Digits(in.Phone)) < 10 || in.Code != s.cfg.UserCode {
		fail(c, http.StatusUnauthorized, "unauthorized", "Wrong phone or code")
		return
	}
	customer, err := s.st.CustomerByPhone(c, in.Phone)
	if err != nil {
		failErr(c, err)
		return
	}
	if customer == nil {
		customer = &domain.Customer{ID: fleet.NewID("c"), Name: strings.TrimSpace(in.Name), Phone: in.Phone, RecentPlaceIDs: []string{}}
		if customer.Name == "" {
			customer.Name = "App user"
		}
		if err := s.st.SaveCustomer(c, s.st.DB, *customer); err != nil {
			failErr(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"token": s.tokens.issue("user", customer.ID, tokenTTL), "user": customer})
}
