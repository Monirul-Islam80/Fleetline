package api

import (
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

// consoleRoutes are the endpoints the dispatch console calls (src/api/live.ts), where they don't belong to
// an endpoint-list group. The rest of the console's calls are in catalog.go under their list group.
func (s *Server) consoleRoutes(g *gin.RouterGroup) {
	g.GET("/snapshot", s.snapshot)
	g.GET("/logs", s.searchLogs)
	g.POST("/staff/messages", s.sendStaffMessage)
	g.GET("/staff/messages", s.listInbox(store.KindStaffMessage))
	g.GET("/driverchats", s.listInbox(store.KindDriverChat))
	g.POST("/driverchats/:id/take", s.takeChat)
	g.POST("/driverchats/:id/done", s.inboxDelete(store.KindDriverChat))
	g.GET("/callqueue", s.listInbox(store.KindCallQueue))
	g.POST("/callqueue/:id/take", s.inboxDelete(store.KindCallQueue))
	g.GET("/flights", s.listInbox(store.KindFlight))
	g.DELETE("/flights/:id", s.inboxDelete(store.KindFlight))
	g.GET("/operators", s.listInbox(store.KindOperator))
	g.POST("/admin/reset-demo", s.resetDemo)
}

// snapshot is everything the console loads on start.
func (s *Server) snapshot(c *gin.Context) {
	var snap domain.Snapshot
	var err error
	if snap.Jobs, err = s.st.Jobs(c, s.st.DB, ""); err != nil {
		failErr(c, err)
		return
	}
	if snap.Drivers, err = s.st.Drivers(c, s.st.DB, "active"); err != nil {
		failErr(c, err)
		return
	}
	if snap.Customers, err = s.st.Customers(c, s.st.DB, ""); err != nil {
		failErr(c, err)
		return
	}
	if snap.Zones, err = s.st.Zones(c); err != nil {
		failErr(c, err)
		return
	}
	if snap.Inbox, err = s.st.LoadInbox(c); err != nil {
		failErr(c, err)
		return
	}
	snap.NextJobNumber = s.st.PeekJobNumber(c)
	c.JSON(http.StatusOK, snap)
}

// searchBookings is the console's Bookings view (BookingQuery). Mounted as GET /bookings/history.
func (s *Server) searchBookings(c *gin.Context) {
	now := fleet.NowMillis()
	from, _, okFrom := fleet.DayRange(c.Query("from"), now)
	if !okFrom {
		from = 0
	}
	if t, good := fleet.HHMM(c.Query("fromTime")); good {
		from += t
	}
	var to domain.Millis = math.MaxInt64
	if start, end, good := fleet.DayRange(c.Query("to"), now); good && c.Query("to") != "" {
		to = end
		if t, good := fleet.HHMM(c.Query("toTime")); good {
			to = start + t + 59_999
		}
	}
	page, err := s.st.SearchBookings(c, store.BookingFilter{
		From: from, To: to,
		SiteID: c.Query("siteId"), Source: c.Query("source"), Status: c.Query("status"),
		JobNumber: c.Query("jobNumber"), Driver: c.Query("driver"), Address: c.Query("address"),
		Destination: c.Query("destination"), CustomerName: c.Query("customerName"),
		CustomerPhone: c.Query("customerPhone"), Account: c.Query("account"), Keyword: c.Query("keyword"),
		Page: qInt(c, "page", 1), PageSize: qInt(c, "pageSize", 50), NewestFirst: true,
	})
	ok(c, page, err)
}

// searchDrivers is the console's Drivers view (DriverQuery), and "Get All Drivers" in the list.
func (s *Server) searchDrivers(c *gin.Context) {
	list, err := s.st.Drivers(c, s.st.DB, "")
	if err != nil {
		failErr(c, err)
		return
	}
	version, site, active := c.DefaultQuery("version", "ALL"), c.DefaultQuery("siteId", "ALL"), c.DefaultQuery("active", "ALL")
	phone := fleet.Digits(c.Query("phone"))
	out := []domain.Driver{}
	for _, d := range list {
		if fleet.Has(d.Callsign, c.Query("ref")) && fleet.Has(d.Name, c.Query("name")) && fleet.Has(d.Plate, c.Query("plate")) &&
			fleet.Has(d.Badge, c.Query("badge")) && (version == "ALL" || version == "" || d.AppVersion == version) &&
			fleet.Has(fleet.Digits(d.Phone), phone) && (site == "ALL" || site == "" || d.SiteID == site) &&
			(active == "ALL" || active == "" || (active == "ONLINE") == (d.Status != domain.DriverAway)) &&
			fleet.Has(d.Plate, c.Query("vehicleRef")) {
			out = append(out, d)
		}
	}
	if c.Query("sort") == "name" {
		sort.SliceStable(out, func(a, b int) bool { return out[a].Name < out[b].Name })
	}
	c.JSON(http.StatusOK, out)
}

// searchLogs is the console's Logs view (LogQuery).
func (s *Server) searchLogs(c *gin.Context) {
	day := qInt64(c, "day", fleet.NowMillis())
	from, to := fleet.DayRangeAt(day)
	cats := qList(c, "categories")
	if len(cats) == 0 {
		cats = []string{"SYSTEM", "DRIVER", "ZONE", "FEEDERSET", "PANIC", "OPERATOR"}
	}
	list, err := s.st.Logs(c, store.LogFilter{
		From: from, To: to, Categories: cats, OldestFirst: qBool(c, "oldestFirst"),
		Driver: c.Query("driver"), Vehicle: c.Query("vehicle"), Zone: c.Query("zone"),
		JobNumber: c.Query("jobNumber"), Operator: c.Query("operator"), Action: c.Query("action"),
	})
	ok(c, list, err)
}

// lookupCustomer is caller ID: one customer or null. Mounted as GET /users/lookup.
func (s *Server) lookupCustomer(c *gin.Context) {
	customer, err := s.st.CustomerByPhone(c, c.Query("phone"))
	ok(c, customer, err)
}

// searchAddresses returns places matching every typed word. Mounted as GET /addresses ("Search Addresses").
func (s *Server) searchAddresses(c *gin.Context) {
	places, err := s.st.SearchPlaces(c, c.Query("q"), min(max(qInt(c, "limit", 8), 1), 50))
	if err != nil {
		failErr(c, err)
		return
	}
	// The console wants Stops; a Place is a Stop plus an id, so return Places as they are.
	ok(c, places, nil)
}

func (s *Server) sendStaffMessage(c *gin.Context) {
	var in struct {
		To   string `json:"to"`
		Body string `json:"body"`
	}
	if !body(c, &in) {
		return
	}
	if strings.TrimSpace(in.To) == "" || strings.TrimSpace(in.Body) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "to and body are required")
		return
	}
	m := domain.StaffMessage{ID: fleet.NewID("sm"), From: s.operatorName(c), To: in.To, Body: strings.TrimSpace(in.Body), At: fleet.NowMillis()}
	err := s.st.InboxPut(c, s.st.DB, store.KindStaffMessage, m.ID, m.At, m)
	created(c, m, err)
}

// sendBroadcast is "Send a Message" to drivers: stored, and delivered by the driver app integration.
func (s *Server) sendBroadcast(c *gin.Context) {
	var in domain.BroadcastInput
	if !body(c, &in) {
		return
	}
	if strings.TrimSpace(in.Message) == "" {
		fail(c, http.StatusUnprocessableEntity, "invalid", "message is required")
		return
	}
	id := fleet.NewID("msg")
	now := fleet.NowMillis()
	err := s.st.InboxPut(c, s.st.DB, store.KindBroadcast, id, now, map[string]any{"id": id, "at": now, "by": s.operatorName(c), "input": in})
	created(c, gin.H{"id": id, "at": now}, err)
}

func (s *Server) takeChat(c *gin.Context) {
	noContent(c, s.st.InboxPatch(c, store.KindDriverChat, c.Param("id"), map[string]any{"takenBy": s.operatorName(c)}))
}

func (s *Server) listInbox(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, err := store.InboxList[map[string]any](c, s.st, kind, min(max(qInt(c, "limit", 200), 1), 1000))
		ok(c, list, err)
	}
}

func (s *Server) inboxDelete(kind string) gin.HandlerFunc {
	return func(c *gin.Context) { noContent(c, s.st.InboxDelete(c, kind, c.Param("id"))) }
}

// driverTracks is the playback screen: GPS history near a point. Mounted as GET /drivers/tracks.
func (s *Server) driverTracks(c *gin.Context) {
	lat, lng, good := latLng(c)
	if !good {
		return
	}
	now := fleet.NowMillis()
	from, to := qInt64(c, "from", now-3_600_000), qInt64(c, "to", now)
	if to < from || to-from > 24*3_600_000 {
		fail(c, http.StatusBadRequest, "bad_request", "from must be before to, and at most 24 hours apart")
		return
	}
	radius, _ := qFloat(c, "radiusM")
	if radius <= 0 || radius > 50_000 {
		radius = 2_000
	}
	tracks, err := s.st.Tracks(c, from, to, domain.LatLng{Lat: lat, Lng: lng}, radius)
	ok(c, tracks, err)
}

func (s *Server) resetDemo(c *gin.Context) {
	if s.reseed == nil {
		fail(c, http.StatusForbidden, "forbidden", "Demo reset is disabled")
		return
	}
	noContent(c, s.reseed(c))
}
