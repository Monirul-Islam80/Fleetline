package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

// catalogRoutes registers the endpoint list, group by group (operator access).
// Groups with dedicated logic have their own file: bookings.go, drivers.go, telephony.go, console.go.
func (s *Server) catalogRoutes(g *gin.RouterGroup) {
	s.bookingRoutes(g)
	s.driverRoutes(g)

	// accountfields
	af := g.Group("/accountfields")
	af.GET("", s.listRes("accountfields", ""))
	af.POST("", s.createAccountField)
	af.GET("/:id", s.getRes("accountfields", "id"))
	af.DELETE("/:id", s.deleteRes("accountfields", "id"))
	af.POST("/:id/values", s.createRes("accountfield_values", "id"))
	af.PATCH("/:id/values/:valueId", s.updateRes("accountfield_values", "valueId"))
	af.DELETE("/:id/values/:valueId", s.deleteRes("accountfield_values", "valueId"))
	af.POST("/:id/validate", s.validateAccountField)

	// accounts
	ac := g.Group("/accounts")
	ac.GET("", s.listRes("accounts", ""))
	ac.POST("", s.createAccount)
	ac.GET("/byphone", s.accountsByPhone)
	ac.GET("/:id", s.getRes("accounts", "id"))
	ac.PATCH("/:id", s.updateRes("accounts", "id"))
	ac.GET("/:id/haspin", s.accountHasPin)
	ac.POST("/:id/pin/confirm", s.confirmAccountPin)
	ac.GET("/:id/config", s.getOne("account_config", "id"))
	ac.POST("/:id/config", s.putOne("account_config", "id"))
	ac.GET("/:id/fields", s.listRes("accountfields", "id"))
	ac.GET("/:id/attributeextras", s.listRes("account_extras", "id"))
	ac.POST("/:id/attributeextras", s.link("account_extras", "id", "extraId"))
	ac.DELETE("/:id/attributeextras/:extraId", s.unlink("account_extras", "id", "extraId", "extraId"))
	ac.GET("/:id/vehicletype", s.getOne("account_vehicletype", "id"))
	ac.POST("/:id/vehicletype", s.putOne("account_vehicletype", "id"))
	ac.GET("/:id/site", s.getOne("account_site", "id"))
	ac.POST("/:id/site", s.putOne("account_site", "id"))
	ac.DELETE("/:id/site", s.deleteOne("account_site", "id"))
	ac.POST("/:id/credit", s.creditAccount)
	ac.GET("/:id/users", s.listRes("account_users", "id"))
	ac.POST("/:id/users", s.link("account_users", "id", "userId"))
	ac.DELETE("/:id/users/:userId", s.unlink("account_users", "id", "userId", "userId"))

	// alerts (the console's alert drawer)
	al := g.Group("/alerts")
	al.GET("", s.listInbox(store.KindAlert))
	al.POST("", s.createAlert)
	al.GET("/:id", s.getAlert)
	al.PUT("/:id", s.updateAlert)
	al.DELETE("/:id", s.inboxDelete(store.KindAlert))

	// attributeextras, attributegroups, attributes, extras
	g.GET("/attributeextras", s.listRes("attributeextras", ""))
	g.GET("/attributegroups", s.listRes("attributegroups", ""))
	g.GET("/attributes/driver", s.filtered("attributes", "appliesTo", "driver"))
	g.GET("/attributes/vehicle", s.filtered("attributes", "appliesTo", "vehicle"))
	g.GET("/extras", s.listRes("extras", ""))

	// cardpayment
	g.POST("/cardpayment", s.cardPayment)
	g.PATCH("/cardpayment/:id", s.bookingPayment)

	// config
	cf := g.Group("/config")
	cf.GET("/vehicletypes", s.vehicleTypes)
	cf.GET("/vehiclemapping", s.fixedGet("config", "vehiclemapping"))
	cf.POST("/vehiclemapping", s.fixedPut("config", "vehiclemapping"))
	cf.GET("/attributeextras", s.listRes("attributeextras", ""))
	cf.GET("/app", s.appConfig)
	cf.GET("/settings", s.appConfig)
	cf.GET("/dispatchrules", s.dispatchRules)
	cf.GET("/languages", static([]gin.H{{"code": "en-GB", "name": "English (UK)"}, {"code": "bn", "name": "Bangla"}, {"code": "pl", "name": "Polish"}, {"code": "ur", "name": "Urdu"}}))

	// content, customerrating, customfields, customvats
	g.GET("/content/terms", s.fixedGet("content", "terms"))
	g.GET("/customerrating/:id", s.customerRating)
	cu := g.Group("/customfields")
	cu.GET("", s.listRes("customfields", ""))
	cu.POST("", s.createRes("customfields", ""))
	cu.GET("/groups", s.customFieldGroups)
	cu.GET("/:id", s.getRes("customfields", "id"))
	cu.PATCH("/:id", s.updateRes("customfields", "id"))
	g.GET("/customvats", s.listRes("customvats", ""))

	// events: webhook listeners notified of booking events
	ev := g.Group("/events")
	ev.GET("/listeners", s.listRes("event_listeners", ""))
	ev.POST("/listeners", s.createListener)
	ev.PATCH("/listeners/:id", s.updateRes("event_listeners", "id"))
	ev.DELETE("/listeners/:id", s.deleteRes("event_listeners", "id"))
	ev.GET("/available", static(availableEvents))

	// fleetengine
	g.GET("/fleetengine/jwt", s.fleetEngineToken)
	g.GET("/fleetengine/vehicles/:id/location", s.vehicleLocation)

	// items
	it := g.Group("/items")
	it.GET("", s.listRes("items", ""))
	it.POST("", s.createRes("items", ""))
	it.GET("/:id", s.getRes("items", "id"))
	it.PATCH("/:id", s.updateRes("items", "id"))

	// journeys: several bookings driven as one
	jo := g.Group("/journeys")
	jo.GET("", s.listRes("journeys", ""))
	jo.POST("", s.createJourney)
	jo.GET("/:id", s.getRes("journeys", "id"))
	jo.PATCH("/:id", s.updateRes("journeys", "id"))
	jo.DELETE("/:id", s.deleteRes("journeys", "id"))
	jo.GET("/:id/state", s.journeyState)
	jo.POST("/:id/bookings", s.appendToJourney)
	jo.POST("/:id/finalize", s.finalizeJourney)
	jo.POST("/:id/dispatch", s.dispatchJourney)

	// messages, sites, staff
	g.POST("/messages", s.sendBroadcast)
	g.GET("/messages", s.listInbox(store.KindBroadcast))
	g.GET("/sites", s.sites)
	g.POST("/staff/:id/pause", s.staffOnline(false))
	g.POST("/staff/:id/resume", s.staffOnline(true))

	// surge
	su := g.Group("/surge")
	su.POST("/active", s.activeSurge)
	su.GET("/price", s.surgePrice)
	su.POST("/price", s.setSurgePrice)
	su.DELETE("/price/:id", s.removeSurgePrice)
	su.GET("/schedules", s.listRes("surge_schedules", ""))
	su.POST("/schedules", s.createRes("surge_schedules", ""))
	su.DELETE("/schedules/zones", s.removeAllScheduleZones)
	su.PATCH("/schedules/:id", s.updateRes("surge_schedules", "id"))
	su.DELETE("/schedules/:id", s.deleteRes("surge_schedules", "id"))
	su.POST("/schedules/:id/surges", s.addScheduleSurge)
	su.DELETE("/schedules/:id/zones", s.removeScheduleZones)

	// users (customers); the per-user routes are in passengerRoutes so passengers can reach their own
	us := g.Group("/users")
	us.GET("", s.listUsers)
	us.POST("", s.createUser)
	us.GET("/lookup", s.lookupCustomer)

	// vehicles
	ve := g.Group("/vehicles")
	ve.GET("", s.listRes("vehicles", ""))
	ve.POST("", s.createRes("vehicles", ""))
	ve.GET("/locations", s.vehicleLocations)
	ve.GET("/ref/:id", s.vehicleRef)
	ve.GET("/id/:id", s.vehicleRef)
	ve.GET("/:id", s.getRes("vehicles", "id"))
	ve.PATCH("/:id", s.updateRes("vehicles", "id"))
	ve.GET("/:id/attributes", s.getOne("vehicle_attributes", "id"))
	ve.POST("/:id/attributes", s.putOne("vehicle_attributes", "id"))
	ve.GET("/:id/location", s.vehicleLocation)
	ve.POST("/:id/message", s.messageVehicle)
	ve.POST("/:id/activate", s.vehicleActive(true))
	ve.POST("/:id/deactivate", s.vehicleActive(false))
	ve.GET("/:id/booking", s.vehicleBooking)
	ve.GET("/:id/sites", s.listRes("vehicle_sites", "id"))
	ve.POST("/:id/sites", s.link("vehicle_sites", "id", "siteId"))
	ve.DELETE("/:id/sites/:siteId", s.unlink("vehicle_sites", "id", "siteId", "siteId"))
	ve.GET("/:id/dispatchlicences", s.listRes("vehicle_licences", "id"))
	ve.POST("/:id/dispatchlicences", s.link("vehicle_licences", "id", "licenceId"))
	ve.DELETE("/:id/dispatchlicences/:licenceId", s.unlink("vehicle_licences", "id", "licenceId", "licenceId"))
	g.POST("/vehicleevents/logon", s.vehicleLogon)

	// zones
	zo := g.Group("/zones")
	zo.GET("", s.zones)
	zo.POST("/bulk", s.bulkZones)
	zo.POST("/clearflags", s.clearZoneFlags)
	zo.GET("/:id", s.zone)
	zo.POST("/:id/fullybooked", s.addFullyBooked)
	zo.PATCH("/:id/fullybooked/:fbId", s.updateRes("fully_booked", "fbId"))
	zo.DELETE("/:id/fullybooked/:fbId", s.removeFullyBooked)

	// actions, app, clienttokens, creditcards, dispatchlicences, driverfatigue, driverpriorityschedule
	g.POST("/actions/:id", s.record("custom_actions", "id"))
	g.GET("/app/credits", s.credits)
	ct := g.Group("/clienttokens")
	ct.GET("", s.listRes("clienttokens", ""))
	ct.POST("", s.createClientToken)
	ct.PATCH("/:id", s.updateRes("clienttokens", "id"))
	ct.DELETE("/:id", s.deleteRes("clienttokens", "id"))
	cc := g.Group("/creditcards")
	cc.GET("", s.listRes("creditcards", ""))
	cc.POST("", s.createCard)
	cc.GET("/types", s.listRes("creditcardtypes", ""))
	cc.GET("/:id", s.getRes("creditcards", "id"))
	cc.PATCH("/:id", s.updateCard)
	cc.DELETE("/:id", s.deleteRes("creditcards", "id"))
	g.GET("/dispatchlicences", s.listRes("dispatchlicences", ""))
	g.GET("/driverfatigue/:id", s.driverFatigue)
	dp := g.Group("/driverpriorityschedule")
	dp.GET("", s.listRes("driver_priority_schedules", ""))
	dp.POST("", s.createRes("driver_priority_schedules", ""))
	dp.DELETE("/:id", s.deleteRes("driver_priority_schedules", "id"))
}

// passengerRoutes are open to passenger tokens as well as operators.
func (s *Server) passengerRoutes(g *gin.RouterGroup) {
	g.POST("/bookings/add", s.addBooking("basic")) // the console's createJob
	g.POST("/quote", s.quote)
	g.GET("/addresses", s.searchAddresses)
	g.GET("/addresses/:id", s.getAddress)
	g.GET("/pricingzones", s.pricingZone)
	g.POST("/users/feedback", s.record("feedback", ""))
	me := g.Group("/users/:id", selfOrOperator("user", "id"))
	me.GET("", s.getUser)
	me.PATCH("", s.updateUser)
	me.GET("/accounts", s.userAccounts)
	me.GET("/addresses", s.customerAddresses)
}

/* ---------- Small handlers for the catalog ---------- */

func (s *Server) filtered(kind, field, value string) gin.HandlerFunc {
	return func(c *gin.Context) {
		items, total, err := s.st.ListResources(c, kind, store.ResourceQuery{Where: map[string]string{field: value}, Limit: 500})
		ok(c, domain.Page[store.Resource]{Items: items, Total: total, Page: 1, PageSize: 500}, err)
	}
}

func (s *Server) fixedGet(kind, id string) gin.HandlerFunc {
	return func(c *gin.Context) {
		r, err := s.st.GetResource(c, kind, id)
		if err == store.ErrNotFound {
			c.JSON(http.StatusOK, store.Resource{"id": id})
			return
		}
		ok(c, r, err)
	}
}

func (s *Server) fixedPut(kind, id string) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, good := object(c)
		if !good {
			return
		}
		data["id"] = id
		r, err := s.st.CreateResource(c, s.st.DB, kind, "", data)
		ok(c, r, err)
	}
}

// createAccountField adds a field; {"accountCode": "ACME-01"} makes it specific to that account.
func (s *Server) createAccountField(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	if name, _ := data["name"].(string); strings.TrimSpace(name) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "name is required")
		return
	}
	parent, _ := data["accountCode"].(string)
	r, err := s.st.CreateResource(c, s.st.DB, "accountfields", parent, data)
	created(c, r, err)
}

// validateAccountField checks one value: required, and in the field's allowed values when it has any.
func (s *Server) validateAccountField(c *gin.Context) {
	var in struct {
		Value string `json:"value"`
	}
	if !body(c, &in) {
		return
	}
	field, err := s.st.GetResource(c, "accountfields", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	values, _, err := s.st.ListResources(c, "accountfield_values", store.ResourceQuery{ParentID: c.Param("id"), Limit: 500})
	if err != nil {
		failErr(c, err)
		return
	}
	required, _ := field["required"].(bool)
	valid, reason := true, ""
	if required && strings.TrimSpace(in.Value) == "" {
		valid, reason = false, "required"
	} else if len(values) > 0 && in.Value != "" {
		valid, reason = false, "not an allowed value"
		for _, v := range values {
			if allowed, _ := v["value"].(string); strings.EqualFold(allowed, in.Value) {
				valid, reason = true, ""
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"valid": valid, "reason": reason})
}

// createAccount uses the account code as the id, so bookings can refer to it.
func (s *Server) createAccount(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	code, _ := data["code"].(string)
	if strings.TrimSpace(code) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "code is required")
		return
	}
	if _, err := s.st.GetResource(c, "accounts", code); err == nil {
		fail(c, http.StatusConflict, "conflict", "Account "+code+" exists")
		return
	}
	data["id"] = code
	r, err := s.st.CreateResource(c, s.st.DB, "accounts", "", data)
	created(c, r, err)
}

func (s *Server) accountsByPhone(c *gin.Context) {
	digits := fleet.Digits(c.Query("phone"))
	if len(digits) < 7 {
		fail(c, http.StatusBadRequest, "bad_request", "phone is required")
		return
	}
	var codes []string
	err := s.st.DB.SelectContext(c, &codes, `SELECT DISTINCT parent_id FROM resources WHERE kind = 'account_users'
		AND right(regexp_replace(data->>'phone','\D','','g'), 10) = right($1, 10)`, digits)
	if err != nil {
		failErr(c, err)
		return
	}
	out := []store.Resource{}
	for _, code := range codes {
		if r, err := s.st.GetResource(c, "accounts", code); err == nil {
			out = append(out, r)
		}
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) accountHasPin(c *gin.Context) {
	acct, err := s.st.GetResource(c, "accounts", c.Param("id"))
	pin, _ := acct["pin"].(string)
	ok(c, gin.H{"hasPin": pin != ""}, err)
}

func (s *Server) confirmAccountPin(c *gin.Context) {
	var in struct {
		Pin string `json:"pin"`
	}
	if !body(c, &in) {
		return
	}
	acct, err := s.st.GetResource(c, "accounts", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	pin, _ := acct["pin"].(string)
	c.JSON(http.StatusOK, gin.H{"valid": pin != "" && pin == in.Pin})
}

// creditAccount records a credit and returns the new balance.
func (s *Server) creditAccount(c *gin.Context) {
	var in struct {
		Amount    float64 `json:"amount"`
		Reference string  `json:"reference"`
	}
	if !body(c, &in) {
		return
	}
	if in.Amount <= 0 {
		fail(c, http.StatusUnprocessableEntity, "invalid", "amount must be positive")
		return
	}
	acct, err := s.st.GetResource(c, "accounts", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	balance, _ := acct["balance"].(float64)
	if _, err := s.st.CreateResource(c, s.st.DB, "account_transactions", c.Param("id"), map[string]any{"amount": in.Amount, "reference": in.Reference, "by": s.operatorName(c)}); err != nil {
		failErr(c, err)
		return
	}
	updated, err := s.st.UpdateResource(c, "accounts", c.Param("id"), map[string]any{"balance": balance + in.Amount})
	ok(c, updated, err)
}

/* ---------- Alerts ---------- */

func (s *Server) createAlert(c *gin.Context) {
	var a domain.Alert
	if !body(c, &a) {
		return
	}
	if strings.TrimSpace(a.Title) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "title is required")
		return
	}
	a.ID, a.At = fleet.NewID("al"), fleet.NowMillis()
	if a.Kind == "" {
		a.Kind = "APP_BOOKING"
	}
	if err := s.st.InboxPut(c, s.st.DB, store.KindAlert, a.ID, a.At, a); err != nil {
		failErr(c, err)
		return
	}
	s.pub.Alert(a)
	c.JSON(http.StatusCreated, a)
}

func (s *Server) getAlert(c *gin.Context) {
	a, err := store.InboxGet[domain.Alert](c, s.st, store.KindAlert, c.Param("id"))
	ok(c, a, err)
}

func (s *Server) updateAlert(c *gin.Context) {
	patch, good := object(c)
	if !good {
		return
	}
	delete(patch, "id")
	if err := s.st.InboxPatch(c, store.KindAlert, c.Param("id"), patch); err != nil {
		failErr(c, err)
		return
	}
	s.getAlert(c)
}

/* ---------- Payments ---------- */

// cardPayment records a card payment taken by the payment provider. Card numbers are never accepted:
// send the provider's payment reference and the last four digits.
func (s *Server) cardPayment(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	if _, has := data["cardNumber"]; has {
		fail(c, http.StatusUnprocessableEntity, "invalid", "Send the payment provider's reference, never the card number")
		return
	}
	bookingID, _ := data["bookingId"].(string)
	if _, err := s.st.Job(c, s.st.DB, bookingID); err != nil {
		failErr(c, err)
		return
	}
	payment, err := s.st.CreateResource(c, s.st.DB, "booking_payments", bookingID, data)
	if err != nil {
		failErr(c, err)
		return
	}
	if _, err := s.svc.UpdateJob(c, bookingID, map[string]any{"payment": "CARD"}); err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, payment)
}

func (s *Server) createCard(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	for _, field := range []string{"number", "cardNumber", "pan", "cvv", "cvc"} {
		if _, has := data[field]; has {
			fail(c, http.StatusUnprocessableEntity, "invalid", "Card numbers and security codes are never stored. Send the provider's card token, brand and last4.")
			return
		}
	}
	if token, _ := data["providerToken"].(string); token == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "providerToken is required")
		return
	}
	r, err := s.st.CreateResource(c, s.st.DB, "creditcards", "", data)
	created(c, r, err)
}

func (s *Server) updateCard(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	for _, field := range []string{"number", "cardNumber", "pan", "cvv", "cvc"} {
		delete(data, field)
	}
	r, err := s.st.UpdateResource(c, "creditcards", c.Param("id"), data)
	ok(c, r, err)
}

/* ---------- Config ---------- */

func (s *Server) vehicleTypes(c *gin.Context) {
	out := []gin.H{}
	for _, id := range []string{"SALOON", "ESTATE", "MPV", "EXEC", "WAV"} {
		v := fleet.Vehicles[id]
		out = append(out, gin.H{"id": id, "label": v.Label, "code": v.Code, "seats": v.Seats})
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) appConfig(c *gin.Context) {
	sites, err := s.st.Sites(c)
	if err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"fleetName": "Western Cars", "timeZone": s.cfg.FleetTimeZone, "currency": "GBP", "locale": "en-GB",
		"tariffs": fleet.Tariffs, "surgeMultiplier": fleet.SurgeMultiplier, "sites": sites,
		"realtime": gin.H{"path": "/api/v1/ws", "publishIntervalMs": s.cfg.PublishInterval.Milliseconds()},
	})
}

func (s *Server) dispatchRules(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"offerTimeoutSec":    int(s.cfg.OfferTimeout.Seconds()),
		"maxMissesBeforeBid": s.cfg.MaxMissesBeforeBid,
		"ranking":            "nearest free driver by PostGIS distance, with enough seats, not excluded or already missed",
		"designatedDriver":   "a job with a designated driver waits for that driver and never opens to bids",
		"prebookingRelease":  "pre-bookings enter dispatch at pickup time minus lead time",
	})
}

func (s *Server) customerRating(c *gin.Context) {
	items, _, err := s.st.ListResources(c, "customer_ratings", store.ResourceQuery{ParentID: c.Param("id"), Limit: 100})
	if err != nil {
		failErr(c, err)
		return
	}
	sum, n := 0.0, 0
	for _, r := range items {
		if v, isNum := r["rating"].(float64); isNum {
			sum += v
			n++
		}
	}
	avg := 0.0
	if n > 0 {
		avg = sum / float64(n)
	}
	c.JSON(http.StatusOK, gin.H{"bookingId": c.Param("id"), "ratings": items, "average": avg, "count": n})
}

func (s *Server) customFieldGroups(c *gin.Context) {
	items, _, err := s.st.ListResources(c, "customfields", store.ResourceQuery{Limit: 500})
	if err != nil {
		failErr(c, err)
		return
	}
	groups := map[string]int{}
	order := []string{}
	for _, f := range items {
		g, _ := f["group"].(string)
		if g == "" {
			g = "General"
		}
		if _, seen := groups[g]; !seen {
			order = append(order, g)
		}
		groups[g]++
	}
	out := []gin.H{}
	for _, g := range order {
		out = append(out, gin.H{"name": g, "fields": groups[g]})
	}
	c.JSON(http.StatusOK, out)
}

/* ---------- Event listeners ---------- */

var availableEvents = []string{"CREATED", "OFFERED", "MISSED", "ACCEPTED", "ASSIGNED", "STATUS", "PAUSED", "RESUMED", "CANCELLED", "NOSHOW"}

// createListener registers a URL to receive booking events. A signing secret is generated and returned once.
func (s *Server) createListener(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	url, _ := data["url"].(string)
	if !strings.HasPrefix(url, "https://") && !strings.HasPrefix(url, "http://localhost") {
		fail(c, http.StatusUnprocessableEntity, "invalid", "url must be https")
		return
	}
	if _, has := data["events"]; !has {
		data["events"] = availableEvents
	}
	data["secret"] = randomHex(16)
	data["active"] = true
	r, err := s.st.CreateResource(c, s.st.DB, "event_listeners", "", data)
	created(c, r, err)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

/* ---------- Fleet engine, vehicles ---------- */

// fleetEngineToken is a short-lived token a map client can use to open the live socket.
func (s *Server) fleetEngineToken(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"token": s.tokens.issue("operator", s.operatorName(c), time.Hour), "expiresInSec": 3600})
}

// vehicleDriver finds the driver a vehicle (resource) is assigned to.
func (s *Server) vehicleDriver(c *gin.Context) (store.Resource, *domain.Driver, bool) {
	v, err := s.st.GetResource(c, "vehicles", c.Param("id"))
	if err != nil {
		// Accept a vehicle ref (the driver's callsign) too.
		items, _, lerr := s.st.ListResources(c, "vehicles", store.ResourceQuery{Where: map[string]string{"ref": c.Param("id")}, Limit: 1})
		if lerr != nil || len(items) == 0 {
			failErr(c, err)
			return nil, nil, false
		}
		v = items[0]
	}
	driverID, _ := v["driverId"].(string)
	if driverID == "" {
		return v, nil, true
	}
	d, err := s.st.Driver(c, s.st.DB, driverID)
	if err != nil {
		return v, nil, true
	}
	return v, &d, true
}

func (s *Server) vehicleLocation(c *gin.Context) {
	v, d, good := s.vehicleDriver(c)
	if !good {
		return
	}
	if d == nil {
		fail(c, http.StatusNotFound, "not_found", "Vehicle has no driver logged on")
		return
	}
	c.JSON(http.StatusOK, gin.H{"vehicleId": v["id"], "lat": d.Lat, "lng": d.Lng, "status": d.Status, "updatedAt": d.UpdatedAt})
}

func (s *Server) vehicleLocations(c *gin.Context) {
	ids := qList(c, "ids")
	items, _, err := s.st.ListResources(c, "vehicles", store.ResourceQuery{Limit: 500})
	if err != nil {
		failErr(c, err)
		return
	}
	drivers, err := s.st.Drivers(c, s.st.DB, "")
	if err != nil {
		failErr(c, err)
		return
	}
	byID := map[string]domain.Driver{}
	for _, d := range drivers {
		byID[d.ID] = d
	}
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	out := []gin.H{}
	for _, v := range items {
		id, _ := v["id"].(string)
		ref, _ := v["ref"].(string)
		if len(want) > 0 && !want[id] && !want[ref] {
			continue
		}
		driverID, _ := v["driverId"].(string)
		if d, has := byID[driverID]; has {
			out = append(out, gin.H{"vehicleId": id, "ref": ref, "lat": d.Lat, "lng": d.Lng, "status": d.Status, "updatedAt": d.UpdatedAt})
		}
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) vehicleRef(c *gin.Context) {
	v, _, good := s.vehicleDriver(c)
	if good {
		c.JSON(http.StatusOK, gin.H{"id": v["id"], "ref": v["ref"]})
	}
}

func (s *Server) vehicleBooking(c *gin.Context) {
	_, d, good := s.vehicleDriver(c)
	if !good {
		return
	}
	if d == nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	job, err := s.svc.CurrentJob(c, d.ID)
	ok(c, job, err)
}

func (s *Server) messageVehicle(c *gin.Context) {
	_, d, good := s.vehicleDriver(c)
	if !good {
		return
	}
	if d == nil {
		fail(c, http.StatusConflict, "conflict", "Vehicle has no driver to message")
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "id", Value: d.ID})
	s.messageDriver(c)
}

func (s *Server) vehicleActive(active bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		r, err := s.st.UpdateResource(c, "vehicles", c.Param("id"), map[string]any{"active": active})
		ok(c, r, err)
	}
}

// vehicleLogon is "Publish a Driver Logon/Logoff Event": {"driverId" or "callsign", "event": "LOGON" | "LOGOFF"}.
func (s *Server) vehicleLogon(c *gin.Context) {
	var in struct {
		DriverID string `json:"driverId"`
		Callsign string `json:"callsign"`
		Event    string `json:"event"`
	}
	if !body(c, &in) {
		return
	}
	status := map[string]string{"LOGON": domain.DriverAvailable, "LOGOFF": domain.DriverAway}[strings.ToUpper(in.Event)]
	if status == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "event must be LOGON or LOGOFF")
		return
	}
	d, err := s.svc.SetPresence(c, coalesce(in.DriverID, in.Callsign), status)
	ok(c, d, err)
}

/* ---------- Journeys ---------- */

func (s *Server) createJourney(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	if _, has := data["bookingIds"]; !has {
		data["bookingIds"] = []string{}
	}
	data["finalized"] = false
	r, err := s.st.CreateResource(c, s.st.DB, "journeys", "", data)
	created(c, r, err)
}

func (s *Server) journeyJobs(c *gin.Context) (store.Resource, []domain.Job, bool) {
	j, err := s.st.GetResource(c, "journeys", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return nil, nil, false
	}
	jobs, err := s.st.Jobs(c, s.st.DB, `id = ANY($1)`, stringList(j["bookingIds"]))
	if err != nil {
		failErr(c, err)
		return nil, nil, false
	}
	return j, jobs, true
}

func (s *Server) journeyState(c *gin.Context) {
	j, jobs, good := s.journeyJobs(c)
	if !good {
		return
	}
	segments := []gin.H{}
	for i, job := range jobs {
		segments = append(segments, gin.H{"order": i + 1, "bookingId": job.ID, "number": job.Number, "status": job.Status, "pickup": job.Pickup, "dropoff": job.Dropoff, "driverId": job.DriverID})
	}
	c.JSON(http.StatusOK, gin.H{"journey": j, "segments": segments})
}

func (s *Server) appendToJourney(c *gin.Context) {
	var in struct {
		BookingID string `json:"bookingId"`
	}
	if !body(c, &in) {
		return
	}
	if _, err := s.st.Job(c, s.st.DB, in.BookingID); err != nil {
		failErr(c, err)
		return
	}
	j, err := s.st.GetResource(c, "journeys", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	if done, _ := j["finalized"].(bool); done {
		fail(c, http.StatusConflict, "conflict", "Journey is finalized")
		return
	}
	ids := stringList(j["bookingIds"])
	for _, id := range ids {
		if id == in.BookingID {
			c.JSON(http.StatusOK, j)
			return
		}
	}
	r, err := s.st.UpdateResource(c, "journeys", c.Param("id"), map[string]any{"bookingIds": append(ids, in.BookingID)})
	ok(c, r, err)
}

func (s *Server) finalizeJourney(c *gin.Context) {
	_, jobs, good := s.journeyJobs(c)
	if !good {
		return
	}
	total := 0.0
	for _, j := range jobs {
		total += fleet.Deref(j.Fare)
	}
	r, err := s.st.UpdateResource(c, "journeys", c.Param("id"), map[string]any{"finalized": true, "price": total})
	ok(c, r, err)
}

// dispatchJourney allocates every booking in the journey to one driver, in order.
func (s *Server) dispatchJourney(c *gin.Context) {
	var in struct {
		Callsign string `json:"callsign"`
	}
	if !body(c, &in) {
		return
	}
	_, jobs, good := s.journeyJobs(c)
	if !good {
		return
	}
	if len(jobs) == 0 {
		fail(c, http.StatusConflict, "conflict", "Journey has no bookings")
		return
	}
	first, err := s.svc.Action(c, jobs[0].ID, "assign", in.Callsign)
	if err != nil {
		failErr(c, err)
		return
	}
	// Later legs wait for the same driver: designate them, the engine offers each when the driver is free.
	for _, j := range jobs[1:] {
		if _, err := s.svc.UpdateJob(c, j.ID, map[string]any{"designatedDriverId": *first.DriverID}); err != nil {
			failErr(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"dispatched": first.ID, "designated": len(jobs) - 1})
}

/* ---------- Sites, staff, users ---------- */

func (s *Server) sites(c *gin.Context) {
	list, err := s.st.Sites(c)
	ok(c, list, err)
}

func (s *Server) staffOnline(online bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := s.st.InboxPatch(c, store.KindOperator, c.Param("id"), map[string]any{"online": online}); err != nil {
			failErr(c, err)
			return
		}
		op, err := store.InboxGet[domain.Operator](c, s.st, store.KindOperator, c.Param("id"))
		ok(c, op, err)
	}
}

func (s *Server) listUsers(c *gin.Context) {
	where, args := "", []any{}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		where, args = `doc->>'name' ILIKE $1 OR phone_digits LIKE $2`, []any{"%" + q + "%", "%" + fleet.Digits(q) + "%"}
		if fleet.Digits(q) == "" {
			where, args = `doc->>'name' ILIKE $1`, []any{"%" + q + "%"}
		}
	}
	list, err := s.st.Customers(c, s.st.DB, where, args...)
	ok(c, list, err)
}

func (s *Server) createUser(c *gin.Context) {
	var cust domain.Customer
	if !body(c, &cust) {
		return
	}
	if strings.TrimSpace(cust.Name) == "" || len(fleet.Digits(cust.Phone)) < 10 {
		fail(c, http.StatusUnprocessableEntity, "invalid", "name and a full phone number are required")
		return
	}
	if existing, _ := s.st.CustomerByPhone(c, cust.Phone); existing != nil {
		fail(c, http.StatusConflict, "conflict", "A customer with this phone exists: "+existing.ID)
		return
	}
	cust.ID = fleet.NewID("c")
	err := s.st.SaveCustomer(c, s.st.DB, cust)
	created(c, cust, err)
}

func (s *Server) getUser(c *gin.Context) {
	cust, err := s.st.Customer(c, c.Param("id"))
	ok(c, cust, err)
}

// updateUser edits name, email and account. Phone changes go through a new sign-in.
func (s *Server) updateUser(c *gin.Context) {
	var in struct {
		Name        *string `json:"name"`
		Email       *string `json:"email"`
		AccountCode *string `json:"accountCode"`
	}
	if !body(c, &in) {
		return
	}
	cust, err := s.st.Customer(c, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	if in.Name != nil {
		cust.Name = *in.Name
	}
	if in.Email != nil {
		cust.Email = in.Email
	}
	if in.AccountCode != nil && principal(c).Kind == "operator" {
		cust.AccountCode = in.AccountCode
	}
	err = s.st.SaveCustomer(c, s.st.DB, cust)
	ok(c, cust, err)
}

func (s *Server) userAccounts(c *gin.Context) {
	cust, err := s.st.Customer(c, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	out := []store.Resource{}
	if cust.AccountCode != nil {
		if acct, err := s.st.GetResource(c, "accounts", *cust.AccountCode); err == nil {
			delete(acct, "pin")
			out = append(out, acct)
		}
	}
	c.JSON(http.StatusOK, out)
}

/* ---------- Quote, pricing zones, surge ---------- */

func (s *Server) quote(c *gin.Context) {
	var in struct {
		Pickup  *domain.Stop  `json:"pickup"`
		Vias    []domain.Stop `json:"vias"`
		Dropoff *domain.Stop  `json:"dropoff"`
	}
	if !body(c, &in) {
		return
	}
	if in.Pickup == nil || in.Dropoff == nil {
		fail(c, http.StatusUnprocessableEntity, "invalid", "pickup and dropoff are required")
		return
	}
	q, err := s.svc.Quote(c, *in.Pickup, in.Vias, in.Dropoff)
	ok(c, q, err)
}

func (s *Server) getAddress(c *gin.Context) {
	p, err := s.st.Place(c, c.Param("id"))
	ok(c, p, err)
}

// pricingZone is point-in-polygon: which zone a coordinate is in, and whether it is surging.
func (s *Server) pricingZone(c *gin.Context) {
	lat, lng, good := latLng(c)
	if !good {
		return
	}
	z, err := s.st.ZoneAt(c, s.st.DB, domain.LatLng{Lat: lat, Lng: lng})
	if err == store.ErrNotFound {
		c.JSON(http.StatusOK, gin.H{"zone": nil, "multiplier": 1})
		return
	}
	if err != nil {
		failErr(c, err)
		return
	}
	mult := 1.0
	if z.Surge {
		mult = fleet.SurgeMultiplier
	}
	c.JSON(http.StatusOK, gin.H{"zone": z, "multiplier": mult})
}

func (s *Server) activeSurge(c *gin.Context) {
	var in struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if !body(c, &in) {
		return
	}
	c.Request.URL.RawQuery = "lat=" + fmtCoord(in.Lat) + "&lng=" + fmtCoord(in.Lng)
	s.pricingZone(c)
}

func (s *Server) surgePrice(c *gin.Context) {
	zones, err := s.st.Zones(c)
	if err != nil {
		failErr(c, err)
		return
	}
	out := []gin.H{}
	for _, z := range zones {
		if (c.Query("zoneId") == "" || c.Query("zoneId") == z.ID) && z.Surge {
			out = append(out, gin.H{"zoneId": z.ID, "zone": z.Name, "multiplier": fleet.SurgeMultiplier})
		}
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) setSurge(c *gin.Context, zoneIDs []string, on bool) {
	if err := s.st.SetZoneFlags(c, zoneIDs, &on, nil); err != nil {
		failErr(c, err)
		return
	}
	noContent(c, s.svc.PublishZones(c))
}

func (s *Server) setSurgePrice(c *gin.Context) {
	var in struct {
		ZoneID string `json:"zoneId"`
	}
	if !body(c, &in) {
		return
	}
	if _, err := s.st.Zone(c, in.ZoneID); err != nil {
		failErr(c, err)
		return
	}
	s.setSurge(c, []string{in.ZoneID}, true)
}

func (s *Server) removeSurgePrice(c *gin.Context) {
	if _, err := s.st.Zone(c, c.Param("id")); err != nil {
		failErr(c, err)
		return
	}
	s.setSurge(c, []string{c.Param("id")}, false)
}

func (s *Server) addScheduleSurge(c *gin.Context) {
	var in struct {
		ZoneIDs    []string `json:"zoneIds"`
		Multiplier float64  `json:"multiplier"`
	}
	if !body(c, &in) {
		return
	}
	sched, err := s.st.GetResource(c, "surge_schedules", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	zones := append(stringList(sched["zoneIds"]), in.ZoneIDs...)
	r, err := s.st.UpdateResource(c, "surge_schedules", c.Param("id"), map[string]any{"zoneIds": unique(zones), "multiplier": in.Multiplier})
	ok(c, r, err)
}

func (s *Server) removeScheduleZones(c *gin.Context) {
	var in struct {
		ZoneIDs []string `json:"zoneIds"`
	}
	if !body(c, &in) {
		return
	}
	sched, err := s.st.GetResource(c, "surge_schedules", c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	drop := map[string]bool{}
	for _, z := range in.ZoneIDs {
		drop[z] = true
	}
	keep := []string{}
	for _, z := range stringList(sched["zoneIds"]) {
		if !drop[z] {
			keep = append(keep, z)
		}
	}
	r, err := s.st.UpdateResource(c, "surge_schedules", c.Param("id"), map[string]any{"zoneIds": keep})
	ok(c, r, err)
}

func (s *Server) removeAllScheduleZones(c *gin.Context) {
	items, _, err := s.st.ListResources(c, "surge_schedules", store.ResourceQuery{Limit: 500})
	if err != nil {
		failErr(c, err)
		return
	}
	for _, sched := range items {
		id, _ := sched["id"].(string)
		if _, err := s.st.UpdateResource(c, "surge_schedules", id, map[string]any{"zoneIds": []string{}}); err != nil {
			failErr(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"schedules": len(items)})
}

/* ---------- Zones ---------- */

func (s *Server) zones(c *gin.Context) {
	list, err := s.st.Zones(c)
	ok(c, list, err)
}

func (s *Server) zone(c *gin.Context) {
	z, err := s.st.Zone(c, c.Param("id"))
	ok(c, z, err)
}

// bulkZones creates or updates zones: [{id, name, lat, lng, radiusM, tag}].
func (s *Server) bulkZones(c *gin.Context) {
	var in []domain.Zone
	if !body(c, &in) {
		return
	}
	for _, z := range in {
		if z.ID == "" || z.Name == "" || z.RadiusM <= 0 {
			fail(c, http.StatusUnprocessableEntity, "invalid", "every zone needs id, name and radiusM")
			return
		}
		if z.Tag == "" {
			z.Tag = "local"
		}
		if err := s.st.SaveZone(c, s.st.DB, z); err != nil {
			failErr(c, err)
			return
		}
	}
	if err := s.svc.PublishZones(c); err != nil {
		failErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"saved": len(in)})
}

func (s *Server) clearZoneFlags(c *gin.Context) {
	noContent(c, s.svc.ClearZoneFlags(c))
}

// addFullyBooked marks a zone fully booked for a time window and flags it now.
func (s *Server) addFullyBooked(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	if _, err := s.st.Zone(c, c.Param("id")); err != nil {
		failErr(c, err)
		return
	}
	r, err := s.st.CreateResource(c, s.st.DB, "fully_booked", c.Param("id"), data)
	if err != nil {
		failErr(c, err)
		return
	}
	on := true
	if err := s.st.SetZoneFlags(c, []string{c.Param("id")}, nil, &on); err != nil {
		failErr(c, err)
		return
	}
	_ = s.svc.PublishZones(c)
	c.JSON(http.StatusCreated, r)
}

func (s *Server) removeFullyBooked(c *gin.Context) {
	if err := s.st.DeleteResource(c, "fully_booked", c.Param("fbId")); err != nil {
		failErr(c, err)
		return
	}
	remaining, _, err := s.st.ListResources(c, "fully_booked", store.ResourceQuery{ParentID: c.Param("id"), Limit: 1})
	if err == nil && len(remaining) == 0 {
		off := false
		_ = s.st.SetZoneFlags(c, []string{c.Param("id")}, nil, &off)
		_ = s.svc.PublishZones(c)
	}
	noContent(c, err)
}

/* ---------- Misc ---------- */

func (s *Server) credits(c *gin.Context) {
	var used int
	_ = s.st.DB.GetContext(c, &used, `SELECT count(*) FROM jobs WHERE created_at >= $1`, fleet.NowMillis()-30*24*3_600_000)
	c.JSON(http.StatusOK, gin.H{"plan": "demo", "bookingsLast30Days": used, "remaining": nil})
}

func (s *Server) createClientToken(c *gin.Context) {
	data, good := object(c)
	if !good {
		return
	}
	if name, _ := data["name"].(string); strings.TrimSpace(name) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "name is required")
		return
	}
	data["token"] = "flt_" + randomHex(24)
	data["active"] = true
	r, err := s.st.CreateResource(c, s.st.DB, "clienttokens", "", data)
	created(c, r, err)
}

// driverFatigue reports time on trips today; over 10 hours is flagged.
func (s *Server) driverFatigue(c *gin.Context) {
	d, err := s.st.DriverByRef(c, s.st.DB, c.Param("id"))
	if err != nil {
		failErr(c, err)
		return
	}
	from, to := fleet.DayRangeAt(fleet.NowMillis())
	var ms float64
	err = s.st.DB.GetContext(c, &ms, `SELECT coalesce(sum(greatest(updated_at - pickup_at, 0)), 0) FROM jobs
		WHERE driver_id = $1 AND status = 'COMPLETED' AND pickup_at BETWEEN $2 AND $3`, d.ID, from, to)
	hours := ms / 3_600_000
	ok(c, gin.H{"driverId": d.ID, "callsign": d.Callsign, "hoursOnTripsToday": hours, "fatigued": hours > 10, "limitHours": 10}, err)
}

func unique(list []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range list {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
