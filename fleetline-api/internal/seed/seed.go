// Package seed loads the demo fleet: the same invented zones, places, drivers, customers, jobs and inbox
// the console's mock mode uses (src/mock/geography.ts and seed.ts), timed relative to now.
// No real passengers, drivers or operators. Phone numbers are in Ofcom's 07700 900xxx drama range.
package seed

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"

	"github.com/jmoiron/sqlx"

	"fleetline/api/internal/domain"
	"fleetline/api/internal/fleet"
	"fleetline/api/internal/store"
)

var Sites = []domain.Site{
	{ID: "wc", Name: "Western Cars"},
	{ID: "wc-eg", Name: "Western Cars East Grinstead"},
	{ID: "wc-cr", Name: "Western Cars Crawley"},
	{ID: "wc-hh", Name: "Western Cars Haywards Heath"},
	{ID: "wc-fr", Name: "Western Cars Forest Row"},
	{ID: "wc-hl", Name: "Western Cars Horley"},
	{ID: "wc-hs", Name: "Western Cars Horsham"},
	{ID: "wc-br", Name: "Western Cars Brighton"},
}

var Zones = []domain.Zone{
	{ID: "eg", Name: "East Grinstead", Lat: 51.1255, Lng: -0.011, RadiusM: 2200, Tag: "local"},
	{ID: "cd", Name: "Crawley Down", Lat: 51.1206, Lng: -0.078, RadiusM: 1500, Tag: "local"},
	{ID: "fb", Name: "Felbridge", Lat: 51.138, Lng: -0.035, RadiusM: 1200, Tag: "local"},
	{ID: "lf", Name: "Lingfield", Lat: 51.174, Lng: -0.009, RadiusM: 1800, Tag: "local"},
	{ID: "fr", Name: "Forest Row", Lat: 51.0975, Lng: 0.0335, RadiusM: 1500, Tag: "local"},
	{ID: "aw", Name: "Ashurst Wood", Lat: 51.11, Lng: 0.027, RadiusM: 1000, Tag: "local"},
	{ID: "th", Name: "Turners Hill", Lat: 51.103, Lng: -0.087, RadiusM: 1000, Tag: "local"},
	{ID: "wh", Name: "West Hoathly", Lat: 51.079, Lng: -0.056, RadiusM: 1200, Tag: "outer"},
	{ID: "cp", Name: "Copthorne", Lat: 51.14, Lng: -0.107, RadiusM: 1300, Tag: "outer"},
	{ID: "cr", Name: "Crawley", Lat: 51.113, Lng: -0.185, RadiusM: 3000, Tag: "outer"},
	{ID: "gw", Name: "Gatwick", Lat: 51.158, Lng: -0.17, RadiusM: 1800, Tag: "airport"},
	{ID: "hh", Name: "Haywards Heath", Lat: 51.003, Lng: -0.1, RadiusM: 2200, Tag: "outer"},
	{ID: "ld", Name: "Lindfield", Lat: 51.014, Lng: -0.079, RadiusM: 1000, Tag: "outer"},
}

var Places = []domain.Place{
	{ID: "p01", Label: "East Grinstead Station", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1265, Lng: -0.0178},
	{ID: "p02", Label: "Queen Victoria Hospital", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1403, Lng: -0.0062},
	{ID: "p03", Label: "High Street", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1229, Lng: -0.0063},
	{ID: "p04", Label: "Chequer Mead Theatre", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1222, Lng: -0.0094},
	{ID: "p05", Label: "Kings Centre", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1247, Lng: -0.0128},
	{ID: "p06", Label: "Imberhorne School", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1292, Lng: -0.0331},
	{ID: "p07", Label: "Sackville School", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1183, Lng: 0.0008},
	{ID: "p08", Label: "East Court", Area: "East Grinstead", Postcode: "RH19", ZoneID: "eg", Lat: 51.1285, Lng: 0.0012},
	{ID: "p09", Label: "Village centre", Area: "Crawley Down", Postcode: "RH10", ZoneID: "cd", Lat: 51.1206, Lng: -0.078},
	{ID: "p10", Label: "Felbridge Hotel", Area: "Felbridge", Postcode: "RH19", ZoneID: "fb", Lat: 51.1383, Lng: -0.0312},
	{ID: "p11", Label: "Lingfield Station", Area: "Lingfield", Postcode: "RH7", ZoneID: "lf", Lat: 51.1765, Lng: -0.007},
	{ID: "p12", Label: "Lingfield Park Racecourse", Area: "Lingfield", Postcode: "RH7", ZoneID: "lf", Lat: 51.1705, Lng: -0.0135},
	{ID: "p13", Label: "Forest Row Square", Area: "Forest Row", Postcode: "RH18", ZoneID: "fr", Lat: 51.0977, Lng: 0.0339},
	{ID: "p14", Label: "Ashurst Wood village", Area: "Ashurst Wood", Postcode: "RH19", ZoneID: "aw", Lat: 51.1103, Lng: 0.0262},
	{ID: "p15", Label: "Turners Hill crossroads", Area: "Turners Hill", Postcode: "RH10", ZoneID: "th", Lat: 51.1032, Lng: -0.0868},
	{ID: "p16", Label: "Kingscote Station", Area: "West Hoathly", Postcode: "RH19", ZoneID: "wh", Lat: 51.1047, Lng: -0.0492},
	{ID: "p17", Label: "West Hoathly village", Area: "West Hoathly", Postcode: "RH19", ZoneID: "wh", Lat: 51.0786, Lng: -0.0563},
	{ID: "p18", Label: "Copthorne village", Area: "Copthorne", Postcode: "RH10", ZoneID: "cp", Lat: 51.1398, Lng: -0.1072},
	{ID: "p19", Label: "Three Bridges Station", Area: "Crawley", Postcode: "RH10", ZoneID: "cr", Lat: 51.1169, Lng: -0.1612},
	{ID: "p20", Label: "Crawley Station", Area: "Crawley", Postcode: "RH10", ZoneID: "cr", Lat: 51.1123, Lng: -0.1866},
	{ID: "p21", Label: "County Mall", Area: "Crawley", Postcode: "RH10", ZoneID: "cr", Lat: 51.1112, Lng: -0.1832},
	{ID: "p22", Label: "Crawley Hospital", Area: "Crawley", Postcode: "RH11", ZoneID: "cr", Lat: 51.1163, Lng: -0.1958},
	{ID: "p23", Label: "Gatwick South Terminal", Area: "Gatwick", Postcode: "RH6", ZoneID: "gw", Lat: 51.1565, Lng: -0.161},
	{ID: "p24", Label: "Gatwick North Terminal", Area: "Gatwick", Postcode: "RH6", ZoneID: "gw", Lat: 51.162, Lng: -0.177},
	{ID: "p25", Label: "Haywards Heath Station", Area: "Haywards Heath", Postcode: "RH16", ZoneID: "hh", Lat: 51.0055, Lng: -0.105},
	{ID: "p26", Label: "Princess Royal Hospital", Area: "Haywards Heath", Postcode: "RH16", ZoneID: "hh", Lat: 51.0042, Lng: -0.0877},
	{ID: "p27", Label: "The Orchards", Area: "Haywards Heath", Postcode: "RH16", ZoneID: "hh", Lat: 51.0003, Lng: -0.1012},
	{ID: "p28", Label: "Lindfield High Street", Area: "Lindfield", Postcode: "RH16", ZoneID: "ld", Lat: 51.014, Lng: -0.0789},
}

var (
	first         = []string{"Amelia", "Oliver", "Isla", "George", "Ava", "Harry", "Mia", "Jack", "Freya", "Noah", "Grace", "Leo", "Evie", "Arthur", "Poppy", "Oscar", "Lily", "Alfie", "Rosie", "Theo"}
	last          = []string{"Hartley", "Penrose", "Ashdown", "Calloway", "Brooke", "Fenwick", "Holloway", "Marsh", "Kendrick", "Lowell", "Stanway", "Thorne", "Wakefield", "Yardley", "Ellery", "Garner"}
	driverFirst   = []string{"Sam", "Ali", "Dan", "Raj", "Tom", "Kev", "Mo", "Lee", "Pete", "Imran", "Gary", "Nadeem", "Chris", "Wes"}
	OperatorNames = []string{"Demo Operator", "Sara Lind", "Tom Reeve", "Nadia Brook", "Owen Hale", "Priya Shah", "Ben Ward", "Lucy Moss"}
	instructions  = []string{"", "", "", "RING ON ARRIVAL", "WAIT OUTSIDE MAIN ENTRANCE", "CHILD SEAT NEEDED", "1 CASE AND 2 HAND LUGGAGE", "WHEELCHAIR, FOLDS INTO BOOT"}
	accountCodes  = []string{"ACME-01", "QVH-STAFF", "GTW-CREW"}
)

const minute = int64(60_000)

func FakePhone(n int) string { return fmt.Sprintf("07700 900%03d", n%1000) }

type gen struct{ r *rand.Rand }

func (g gen) f() float64               { return g.r.Float64() }
func (g gen) between(min, max int) int { return min + g.r.Intn(max-min+1) }
func pick[T any](g gen, items []T) T   { return items[g.r.Intn(len(items))] }

// Empty reports whether the database has no demo data yet.
func Empty(ctx context.Context, st *store.Store) bool {
	var n int
	_ = st.DB.GetContext(ctx, &n, `SELECT count(*) FROM sites`)
	return n == 0
}

// Reset deletes every row and loads a fresh demo fleet. Used at first start and by POST /admin/reset-demo.
func Reset(ctx context.Context, st *store.Store) error {
	now := fleet.NowMillis()
	g := gen{rand.New(rand.NewSource(20261023))}
	return st.Tx(ctx, func(tx *sqlx.Tx) error {
		if _, err := tx.ExecContext(ctx, `TRUNCATE job_events, jobs, drivers, customers, places, zones, sites, inbox, resources, track_points`); err != nil {
			return err
		}
		for _, s := range Sites {
			if err := st.SaveSite(ctx, tx, s); err != nil {
				return err
			}
		}
		for _, z := range Zones {
			if err := st.SaveZone(ctx, tx, z); err != nil {
				return err
			}
		}
		for _, p := range Places {
			if err := st.SavePlace(ctx, tx, p); err != nil {
				return err
			}
		}
		customers := makeCustomers(g)
		for _, c := range customers {
			if err := st.SaveCustomer(ctx, tx, c); err != nil {
				return err
			}
		}
		drivers := makeDrivers(g, now)
		for _, d := range drivers {
			if err := st.SaveDriver(ctx, tx, d); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE drivers SET simulated = true`); err != nil {
			return err
		}
		jobs := makeJobs(g, now, customers, drivers)
		if _, err := tx.ExecContext(ctx, `SELECT setval('job_number_seq', $1, false)`, 69749000+int64(len(jobs))*17); err != nil {
			return err
		}
		for _, j := range jobs {
			if err := st.SaveJob(ctx, tx, j); err != nil {
				return err
			}
			if err := st.AddEvent(ctx, tx, domain.JobEvent{ID: "ev-c-" + j.ID, JobID: j.ID, Type: "CREATED", At: j.CreatedAt, Text: "Booking created for " + j.CustomerName + ", " + j.Pickup.Label}); err != nil {
				return err
			}
			if domain.Terminal[j.Status] {
				typ := map[string]string{domain.JobCompleted: "STATUS", domain.JobCancelled: "CANCELLED", domain.JobNoShow: "NOSHOW"}[j.Status]
				text := map[string]string{domain.JobCompleted: "Completed", domain.JobCancelled: "Cancelled by operator", domain.JobNoShow: "Passenger did not show"}[j.Status]
				if err := st.AddEvent(ctx, tx, domain.JobEvent{ID: "ev-t-" + j.ID, JobID: j.ID, Type: typ, At: j.PickupAt + 20*minute, Text: text}); err != nil {
					return err
				}
			}
		}
		if err := seedInbox(ctx, st, tx, g, now, drivers, jobs); err != nil {
			return err
		}
		return seedResources(ctx, st, tx, drivers, customers)
	})
}

func makeCustomers(g gen) []domain.Customer {
	out := make([]domain.Customer, 0, 40)
	for i := 0; i < 40; i++ {
		f, l := pick(g, first), pick(g, last)
		recent := map[string]bool{}
		ids := []string{}
		for n := g.between(2, 5); n > 0; n-- {
			id := pick(g, Places).ID
			if !recent[id] {
				recent[id] = true
				ids = append(ids, id)
			}
		}
		c := domain.Customer{ID: fmt.Sprintf("c%d", i+1), Name: f + " " + l, Phone: FakePhone(100 + i*7), TripCount: g.between(1, 60), RecentPlaceIDs: ids}
		if g.f() > 0.5 {
			c.Email = fleet.Ptr(strings.ToLower(f + "." + l + "@example.com"))
		}
		if g.f() > 0.85 {
			c.AccountCode = fleet.Ptr(pick(g, accountCodes))
		}
		out = append(out, c)
	}
	return out
}

func makeDrivers(g gen, now int64) []domain.Driver {
	vehicles := []string{"SALOON", "SALOON", "SALOON", "ESTATE", "MPV", "EXEC", "WAV"}
	local := []domain.Zone{}
	for _, z := range Zones {
		if z.Tag == "local" {
			local = append(local, z)
		}
	}
	out := make([]domain.Driver, 0, 34)
	for i := 0; i < 34; i++ {
		zone := pick(g, Zones)
		if i < 24 {
			zone = pick(g, local)
		}
		vehicle := pick(g, vehicles)
		status := domain.DriverAvailable
		switch roll := g.f(); {
		case roll < 0.1:
			status = domain.DriverAway
		case roll < 0.45:
			status = domain.DriverParked
		}
		pos := fleet.Jitter(domain.LatLng{Lat: zone.Lat, Lng: zone.Lng}, float64(zone.RadiusM)*0.8, g.f)
		out = append(out, domain.Driver{
			ID: fmt.Sprintf("d%d", i+1), Callsign: fmt.Sprint(120 + i*23),
			Name: pick(g, driverFirst) + " " + pick(g, last), Phone: FakePhone(500 + i*11),
			Plate:      fmt.Sprintf("GX%d %c%cC", g.between(10, 74), 'A'+rune(i%26), 'B'+rune((i*3)%24)),
			Badge:      fmt.Sprintf("PH%d", g.between(1000, 9999)),
			AppVersion: pick(g, []string{"6.4.1", "6.4.0", "6.3.8"}),
			SiteID:     pick(g, Sites).ID, Vehicle: vehicle, Seats: fleet.Vehicles[vehicle].Seats,
			Status: status, ZoneID: fleet.Ptr(zone.ID),
			UpdatedAt: now, StatusSince: now - int64(g.between(1, 290))*minute,
			Lat: pos.Lat, Lng: pos.Lng,
		})
	}
	return out
}

type draft struct {
	status   string
	pickupAt int64
	flight   bool
}

func makeJobs(g gen, now int64, customers []domain.Customer, drivers []domain.Driver) []domain.Job {
	var plan []draft
	add := func(count int, status string, from, to int, flight bool) {
		for i := 0; i < count; i++ {
			plan = append(plan, draft{status, now + int64(g.between(from, to))*minute, flight})
		}
	}
	add(1, domain.JobPaused, -8, -2, true)
	add(1, domain.JobNew, -2, 2, false)
	add(1, domain.JobPaused, 0, 4, false)
	add(1, domain.JobBidding, -3, 0, false)
	add(48, domain.JobBooked, 20, 240, false)
	add(2, domain.JobBooked, 60, 200, true)
	add(16, domain.JobBooked, 250, 1200, false)
	add(54, domain.JobCompleted, -480, -30, false)
	add(5, domain.JobCancelled, -300, -20, false)
	add(3, domain.JobNoShow, -120, -60, false)
	sort.SliceStable(plan, func(a, b int) bool { return plan[a].pickupAt < plan[b].pickupAt })

	sources := []string{"PHONE", "PHONE", "PHONE", "APP", "APP", "WEB"}
	gatwick := []domain.Place{}
	for _, p := range Places {
		if p.ZoneID == "gw" {
			gatwick = append(gatwick, p)
		}
	}
	jobs := make([]domain.Job, 0, len(plan))
	pausedSeen := 0
	for i, d := range plan {
		c := pick(g, customers)
		pickupPlace := pick(g, Places)
		if d.flight {
			pickupPlace = pick(g, gatwick)
		}
		dropPlace := pick(g, Places)
		if dropPlace.ID == pickupPlace.ID {
			dropPlace = pick(g, Places)
		}
		vehicle := "SALOON"
		if g.f() > 0.82 {
			vehicle = pick(g, []string{"ESTATE", "MPV", "EXEC"})
		}
		source := pick(g, sources)
		payment := "CASH"
		if c.AccountCode != nil {
			payment = "ACCOUNT"
		} else if source == "APP" {
			payment = "CARD"
		}
		pickup, dropoff := pickupPlace.Stop(), dropPlace.Stop()
		miles := fleet.RouteMiles([]domain.LatLng{pickup.Point(), dropoff.Point()})
		fare := fleet.QuoteFares(miles, 1)[fleet.TariffFor(vehicle)].Price
		j := domain.Job{
			ID: fmt.Sprintf("j%d", i+1), Number: 69749000 + int64(i)*17, Status: d.status,
			PickupAt: d.pickupAt, IsAsap: d.status == domain.JobNew || d.status == domain.JobBidding,
			LeadMin: 15, Priority: g.between(1, 9), Passengers: g.between(1, fleet.Vehicles[vehicle].Seats), Taxis: 1,
			Vehicle: vehicle, Pickup: pickup, Dropoff: &dropoff,
			CustomerName: strings.ToUpper(c.Name), Phone: c.Phone, Email: c.Email,
			Instructions: pick(g, instructions), AccountCode: c.AccountCode,
			Payment: payment, Source: source, SiteID: pick(g, Sites).ID,
			Fare: &fare, IsRecurring: g.f() > 0.93,
			Options:   domain.BookingOptions{SendSMS: true, SendRingback: g.f() > 0.4},
			CreatedBy: pick(g, OperatorNames),
			CreatedAt: d.pickupAt - int64(g.between(30, 600))*minute, UpdatedAt: now,
			StatusSince: now - int64(g.between(1, 8))*minute,
		}
		if g.f() > 0.9 {
			j.OperatorNotes = "Regular, prefers saloon"
		}
		if d.status == domain.JobCompleted || d.status == domain.JobNoShow {
			j.DriverID = fleet.Ptr(pick(g, drivers).ID)
		}
		if d.status == domain.JobBidding {
			j.MissedBy = []string{"143", "212", "350"}
		}
		if d.flight {
			j.FlightNo = fleet.Ptr(fmt.Sprintf("EZY%d", g.between(8100, 8999)))
		}
		// The second paused job waits for a requested driver, the case operators handle with Driver ID.
		if d.status == domain.JobPaused {
			pausedSeen++
			if pausedSeen == 2 {
				for _, drv := range drivers {
					if drv.Status == domain.DriverAvailable {
						j.DesignatedDriverID = fleet.Ptr(drv.ID)
						break
					}
				}
			}
		}
		j.Normalize()
		jobs = append(jobs, j)
	}
	return jobs
}

func seedInbox(ctx context.Context, st *store.Store, tx *sqlx.Tx, g gen, now int64, drivers []domain.Driver, jobs []domain.Job) error {
	put := func(kind, id string, at int64, v any) error { return st.InboxPut(ctx, tx, kind, id, at, v) }
	callsign := func() string { return pick(g, drivers).Callsign }
	// Operators are listed oldest-first so the console keeps the seeded order.
	for i, name := range OperatorNames {
		op := domain.Operator{ID: fmt.Sprintf("op%d", i+1), Name: name, Online: g.f() > 0.25, BookingsLastHour: max(0, 6-i+g.between(-1, 1))}
		if err := put(store.KindOperator, op.ID, now-int64(len(OperatorNames)-i), op); err != nil {
			return err
		}
	}
	for _, m := range []domain.StaffMessage{
		{ID: "sm1", From: "Sara Lind", To: "All operators", Body: "Driver 235 found a phone. If anyone calls about it, arrange collection please.", At: now - 34*minute},
		{ID: "sm2", From: "Tom Reeve", To: "All operators", Body: "Account customer asked for a payment link, number on job 69749204.", At: now - 61*minute},
		{ID: "sm3", From: "Nadia Brook", To: "All operators", Body: "Please call 662 when free.", At: now - 72*minute},
	} {
		if err := put(store.KindStaffMessage, m.ID, m.At, m); err != nil {
			return err
		}
	}
	for i, c := range []struct {
		text string
		ago  int64
	}{{"The job I did, it was paid", 26}, {"PLEASE SEND ME MY ALLOCATED JOB", 41}, {"Traffic on the A22, running 5 min late", 48}} {
		at := now - c.ago*minute
		chat := domain.DriverChat{ID: fmt.Sprintf("dc%d", i+1), Callsign: callsign(), Response: c.text, Original: "Driver created", MessageAt: at, ResponseAt: at}
		if err := put(store.KindDriverChat, chat.ID, at, chat); err != nil {
			return err
		}
	}
	booked := []domain.Job{}
	for _, j := range jobs {
		if j.Status == domain.JobBooked {
			booked = append(booked, j)
		}
	}
	for i := 0; i < 9; i++ {
		cq := domain.CallRequest{
			ID: fmt.Sprintf("cq%d", i+1), Position: max(1, int(math.Ceil(float64(i)/1.5))), Callsign: callsign(),
			Phone: FakePhone(700 + i*13), Name: strings.ToUpper(pick(g, driverFirst) + " " + pick(g, last)),
			At: now - int64(g.between(2, 400))*minute,
		}
		if i < 2 {
			cq.Position = 1
		}
		if g.f() > 0.5 && i < len(booked) {
			cq.Booking = fleet.Ptr(booked[i].CustomerName + " " + strings.ToUpper(booked[i].Pickup.Label))
		}
		if err := put(store.KindCallQueue, cq.ID, cq.At, cq); err != nil {
			return err
		}
	}
	n := 0
	for _, j := range jobs {
		if j.Source != "APP" || n >= 4 {
			continue
		}
		at := now - int64(n*2+1)*minute
		a := domain.Alert{ID: fmt.Sprintf("al%d", n+1), At: at, Kind: "APP_BOOKING", Title: "New APP Booking",
			Message: fmt.Sprintf("CUST: %s\nPICKUP: %s, %s, %s", j.CustomerName, strings.ToUpper(j.Pickup.Label), strings.ToUpper(j.Pickup.Area), j.Pickup.Postcode),
			JobID:   fleet.Ptr(j.ID)}
		if err := put(store.KindAlert, a.ID, at, a); err != nil {
			return err
		}
		n++
	}
	logout := domain.Alert{ID: "al9", At: now - 3*minute, Kind: "DRIVER_LOGOUT", Title: "DRIVER LOGOUT", Message: callsign() + " has logged out"}
	if err := put(store.KindAlert, logout.ID, logout.At, logout); err != nil {
		return err
	}
	for _, f := range []domain.Flight{
		{ID: "fl1", Airline: "easyJet", Number: "U2816", From: "Edinburgh Airport", To: "London Gatwick Airport", Scheduled: now + 25*minute, Arrival: now + 25*minute, Status: "Scheduled"},
		{ID: "fl2", Airline: "easyJet", Number: "EZY8352", From: "Geneva Airport", To: "London Gatwick Airport", Scheduled: now - 10*minute, Arrival: now + 12*minute, Status: "Delayed", Bookings: 1},
	} {
		if err := put(store.KindFlight, f.ID, f.Scheduled, f); err != nil {
			return err
		}
	}
	return nil
}

// seedResources gives the long-tail endpoints something real to return: accounts, vehicles, extras,
// attributes, licences and config.
func seedResources(ctx context.Context, st *store.Store, tx *sqlx.Tx, drivers []domain.Driver, customers []domain.Customer) error {
	create := func(kind, parent string, data map[string]any) error {
		_, err := st.CreateResource(ctx, tx, kind, parent, data)
		return err
	}
	for _, code := range accountCodes {
		name := map[string]string{"ACME-01": "Acme Logistics", "QVH-STAFF": "Queen Victoria Hospital staff", "GTW-CREW": "Gatwick crew transport"}[code]
		if err := create("accounts", "", map[string]any{"id": code, "code": code, "name": name, "active": true, "balance": 0, "creditLimit": 2000, "pin": "1234", "config": map[string]any{"requiresPin": code == "QVH-STAFF", "invoiceMonthly": true}}); err != nil {
			return err
		}
	}
	for _, c := range customers {
		if c.AccountCode != nil {
			if err := create("account_users", *c.AccountCode, map[string]any{"id": *c.AccountCode + ":" + c.ID, "userId": c.ID, "name": c.Name, "phone": c.Phone}); err != nil {
				return err
			}
		}
	}
	for _, d := range drivers {
		if err := create("vehicles", "", map[string]any{"id": "v" + strings.TrimPrefix(d.ID, "d"), "ref": d.Callsign, "plate": d.Plate, "type": d.Vehicle, "seats": d.Seats, "siteId": d.SiteID, "driverId": d.ID, "active": true}); err != nil {
			return err
		}
	}
	for _, x := range []map[string]any{
		{"id": "child-seat", "name": "Child seat", "price": 5},
		{"id": "pet", "name": "Pet friendly", "price": 3},
		{"id": "meet-greet", "name": "Meet and greet", "price": 8},
		{"id": "extra-luggage", "name": "Extra luggage", "price": 4},
	} {
		if err := create("extras", "", x); err != nil {
			return err
		}
		if err := create("attributeextras", "", x); err != nil {
			return err
		}
	}
	for _, a := range []map[string]any{
		{"id": "wav", "name": "Wheelchair accessible", "group": "vehicle", "appliesTo": "vehicle"},
		{"id": "estate", "name": "Estate boot", "group": "vehicle", "appliesTo": "vehicle"},
		{"id": "exec", "name": "Executive", "group": "vehicle", "appliesTo": "vehicle"},
		{"id": "pet-ok", "name": "Accepts pets", "group": "driver", "appliesTo": "driver"},
		{"id": "airport", "name": "Airport badge", "group": "driver", "appliesTo": "driver"},
	} {
		if err := create("attributes", "", a); err != nil {
			return err
		}
	}
	for _, grp := range []map[string]any{{"id": "vehicle", "name": "Vehicle"}, {"id": "driver", "name": "Driver"}} {
		if err := create("attributegroups", "", grp); err != nil {
			return err
		}
	}
	for _, l := range []map[string]any{
		{"id": "mid-sussex", "name": "Mid Sussex DC", "authority": "Mid Sussex District Council"},
		{"id": "crawley", "name": "Crawley BC", "authority": "Crawley Borough Council"},
		{"id": "tandridge", "name": "Tandridge DC", "authority": "Tandridge District Council"},
	} {
		if err := create("dispatchlicences", "", l); err != nil {
			return err
		}
	}
	for _, v := range []map[string]any{{"id": "standard", "name": "Standard VAT", "rate": 20}, {"id": "zero", "name": "Zero rated", "rate": 0}} {
		if err := create("customvats", "", v); err != nil {
			return err
		}
	}
	for _, t := range []map[string]any{{"id": "visa", "name": "Visa"}, {"id": "mastercard", "name": "Mastercard"}, {"id": "amex", "name": "American Express"}} {
		if err := create("creditcardtypes", "", t); err != nil {
			return err
		}
	}
	return create("content", "", map[string]any{"id": "terms", "title": "Terms and conditions", "body": "Placeholder terms for the demo fleet. Replace with the operator's own."})
}
