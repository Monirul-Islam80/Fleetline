// Package domain mirrors the console's TypeScript types (src/types/domain.ts and api.ts).
// JSON field names must stay identical to the TypeScript ones: the console reads these as-is.
package domain

// Millis is epoch milliseconds, as the console uses everywhere.
type Millis = int64

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Job statuses.
const (
	JobBooked      = "BOOKED"
	JobNew         = "NEW"
	JobPaused      = "PAUSED"
	JobBidding     = "BIDDING"
	JobEnroute     = "ENROUTE"
	JobArrived     = "ARRIVED"
	JobPOB         = "POB"
	JobDroppingOff = "DROPPINGOFF"
	JobCompleted   = "COMPLETED"
	JobNoShow      = "NOSHOW"
	JobCancelled   = "CANCELLED"
)

// Driver statuses.
const (
	DriverAvailable = "AVAILABLE"
	DriverParked    = "PARKED"
	DriverOffered   = "OFFERED"
	DriverEnroute   = "ENROUTE"
	DriverArrived   = "ARRIVED"
	DriverPOB       = "POB"
	DriverDropping  = "DROPPING"
	DriverAway      = "AWAY"
)

// Status groups, matching src/config/status.ts.
var (
	Dispatchable = set(DriverAvailable, DriverParked)
	ActiveTrip   = set(JobEnroute, JobArrived, JobPOB, JobDroppingOff)
	Unassigned   = set(JobNew, JobPaused, JobBidding)
	Terminal     = set(JobCompleted, JobCancelled, JobNoShow)
)

func set(values ...string) map[string]bool {
	m := make(map[string]bool, len(values))
	for _, v := range values {
		m[v] = true
	}
	return m
}

type Place struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Area     string  `json:"area"`
	Postcode string  `json:"postcode"`
	ZoneID   string  `json:"zoneId"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
}

// Stop is a snapshot of a place at booking time.
type Stop struct {
	Label    string  `json:"label"`
	Area     string  `json:"area"`
	Postcode string  `json:"postcode"`
	ZoneID   *string `json:"zoneId"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
}

func (p Place) Stop() Stop {
	zone := p.ZoneID
	return Stop{Label: p.Label, Area: p.Area, Postcode: p.Postcode, ZoneID: &zone, Lat: p.Lat, Lng: p.Lng}
}

func (s Stop) Point() LatLng { return LatLng{Lat: s.Lat, Lng: s.Lng} }

type Zone struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	RadiusM     int     `json:"radiusM"`
	Tag         string  `json:"tag"`
	Surge       bool    `json:"surge"`
	FullyBooked bool    `json:"fullyBooked"`
}

type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Customer struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Phone          string   `json:"phone"`
	Email          *string  `json:"email"`
	TripCount      int      `json:"tripCount"`
	RecentPlaceIDs []string `json:"recentPlaceIds"`
	AccountCode    *string  `json:"accountCode"`
}

type Driver struct {
	ID           string  `json:"id"`
	Callsign     string  `json:"callsign"`
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	Plate        string  `json:"plate"`
	Badge        string  `json:"badge"`
	AppVersion   string  `json:"appVersion"`
	SiteID       string  `json:"siteId"`
	Vehicle      string  `json:"vehicle"`
	Seats        int     `json:"seats"`
	Status       string  `json:"status"`
	Target       *LatLng `json:"target"`
	CurrentJobID *string `json:"currentJobId"`
	ZoneID       *string `json:"zoneId"`
	UpdatedAt    Millis  `json:"updatedAt"`
	StatusSince  Millis  `json:"statusSince"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
}

func (d Driver) Point() LatLng { return LatLng{Lat: d.Lat, Lng: d.Lng} }

type Offer struct {
	DriverID  string `json:"driverId"`
	OfferedAt Millis `json:"offeredAt"`
	ExpiresAt Millis `json:"expiresAt"`
	// DecideAt is a simulator field in the console. The server always sends null: real drivers answer through the API.
	DecideAt *Millis `json:"decideAt"`
}

type BookingOptions struct {
	SendSMS      bool `json:"sendSms"`
	SendRingback bool `json:"sendRingback"`
	AutoComplete bool `json:"autoComplete"`
}

type Job struct {
	ID                 string         `json:"id"`
	Number             int64          `json:"number"`
	Status             string         `json:"status"`
	PickupAt           Millis         `json:"pickupAt"`
	IsAsap             bool           `json:"isAsap"`
	LeadMin            int            `json:"leadMin"`
	Priority           int            `json:"priority"`
	Passengers         int            `json:"passengers"`
	Taxis              int            `json:"taxis"`
	Vehicle            string         `json:"vehicle"`
	Extras             string         `json:"extras"`
	Pickup             Stop           `json:"pickup"`
	Vias               []Stop         `json:"vias"`
	Dropoff            *Stop          `json:"dropoff"`
	CustomerName       string         `json:"customerName"`
	Phone              string         `json:"phone"`
	AltPhone           string         `json:"altPhone"`
	Email              *string        `json:"email"`
	Instructions       string         `json:"instructions"`
	CustomerNotes      string         `json:"customerNotes"`
	OperatorNotes      string         `json:"operatorNotes"`
	ExcludeDrivers     []string       `json:"excludeDrivers"`
	AccountCode        *string        `json:"accountCode"`
	Payment            string         `json:"payment"`
	Source             string         `json:"source"`
	SiteID             string         `json:"siteId"`
	Fare               *float64       `json:"fare"`
	FareOverridden     bool           `json:"fareOverridden"`
	DriverID           *string        `json:"driverId"`
	DesignatedDriverID *string        `json:"designatedDriverId"`
	Offer              *Offer         `json:"offer"`
	MissedBy           []string       `json:"missedBy"`
	FlightNo           *string        `json:"flightNo"`
	IsRecurring        bool           `json:"isRecurring"`
	Options            BookingOptions `json:"options"`
	CreatedBy          string         `json:"createdBy"`
	CreatedAt          Millis         `json:"createdAt"`
	UpdatedAt          Millis         `json:"updatedAt"`
	StatusSince        Millis         `json:"statusSince"`
}

// Normalize replaces nil slices with empty ones, so the console always receives arrays.
func (j *Job) Normalize() {
	if j.Vias == nil {
		j.Vias = []Stop{}
	}
	if j.ExcludeDrivers == nil {
		j.ExcludeDrivers = []string{}
	}
	if j.MissedBy == nil {
		j.MissedBy = []string{}
	}
}

type JobEvent struct {
	ID    string `json:"id"`
	JobID string `json:"jobId"`
	Type  string `json:"type"`
	At    Millis `json:"at"`
	Text  string `json:"text"`
}

type FareQuote struct {
	TariffID string  `json:"tariffId"`
	Label    string  `json:"label"`
	Price    float64 `json:"price"`
}

/* ---------- Counter tabs ---------- */

type Operator struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Online           bool   `json:"online"`
	BookingsLastHour int    `json:"bookingsLastHour"`
}

type StaffMessage struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
	Body string `json:"body"`
	At   Millis `json:"at"`
}

type DriverChat struct {
	ID         string  `json:"id"`
	Callsign   string  `json:"callsign"`
	Response   string  `json:"response"`
	Original   string  `json:"original"`
	MessageAt  Millis  `json:"messageAt"`
	ResponseAt Millis  `json:"responseAt"`
	TakenBy    *string `json:"takenBy"`
}

type CallRequest struct {
	ID       string  `json:"id"`
	Position int     `json:"position"`
	Callsign string  `json:"callsign"`
	Phone    string  `json:"phone"`
	Name     string  `json:"name"`
	Booking  *string `json:"booking"`
	At       Millis  `json:"at"`
}

type Alert struct {
	ID       string  `json:"id"`
	At       Millis  `json:"at"`
	Kind     string  `json:"kind"`
	Title    string  `json:"title"`
	Message  string  `json:"message"`
	JobID    *string `json:"jobId"`
	Callsign *string `json:"callsign"`
}

type Flight struct {
	ID        string `json:"id"`
	Airline   string `json:"airline"`
	Number    string `json:"number"`
	From      string `json:"from"`
	To        string `json:"to"`
	Scheduled Millis `json:"scheduled"`
	Arrival   Millis `json:"arrival"`
	Status    string `json:"status"`
	Bookings  int    `json:"bookings"`
}

type LogEntry struct {
	ID        string `json:"id"`
	At        Millis `json:"at"`
	Category  string `json:"category"`
	Driver    string `json:"driver"`
	Vehicle   string `json:"vehicle"`
	Zone      string `json:"zone"`
	JobNumber string `json:"jobNumber"`
	Operator  string `json:"operator"`
	Action    string `json:"action"`
	Text      string `json:"text"`
}

/* ---------- Requests and responses (src/types/api.ts) ---------- */

type Page[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

type CreateJobInput struct {
	PickupAt           Millis         `json:"pickupAt"`
	LeadMin            int            `json:"leadMin"`
	Priority           int            `json:"priority"`
	Passengers         int            `json:"passengers"`
	Taxis              int            `json:"taxis"`
	Vehicle            string         `json:"vehicle"`
	Extras             string         `json:"extras"`
	Pickup             *Stop          `json:"pickup"`
	Vias               []Stop         `json:"vias"`
	Dropoff            *Stop          `json:"dropoff"`
	CustomerName       string         `json:"customerName"`
	Phone              string         `json:"phone"`
	AltPhone           string         `json:"altPhone"`
	Email              *string        `json:"email"`
	Instructions       string         `json:"instructions"`
	CustomerNotes      string         `json:"customerNotes"`
	OperatorNotes      string         `json:"operatorNotes"`
	ExcludeDrivers     []string       `json:"excludeDrivers"`
	AccountCode        *string        `json:"accountCode"`
	Payment            string         `json:"payment"`
	Source             string         `json:"source"`
	SiteID             string         `json:"siteId"`
	Fare               *float64       `json:"fare"`
	FareOverridden     bool           `json:"fareOverridden"`
	DesignatedCallsign *string        `json:"designatedCallsign"`
	Options            BookingOptions `json:"options"`
}

type BroadcastInput struct {
	Audience string `json:"audience"`
	Message  string `json:"message"`
	Driver   string `json:"driver"`
	Question bool   `json:"question"`
	Type     string `json:"type"`
	Lifetime string `json:"lifetime"`
	Zone     string `json:"zone"`
	Vehicle  string `json:"vehicle"`
	SiteID   string `json:"siteId"`
}

type Inbox struct {
	Operators     []Operator     `json:"operators"`
	StaffMessages []StaffMessage `json:"staffMessages"`
	DriverChats   []DriverChat   `json:"driverChats"`
	CallQueue     []CallRequest  `json:"callQueue"`
	Alerts        []Alert        `json:"alerts"`
	Flights       []Flight       `json:"flights"`
}

type Snapshot struct {
	Customers     []Customer `json:"customers"`
	Drivers       []Driver   `json:"drivers"`
	Jobs          []Job      `json:"jobs"`
	Zones         []Zone     `json:"zones"`
	NextJobNumber int64      `json:"nextJobNumber"`
	Inbox         Inbox      `json:"inbox"`
}

type TrackPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
	At  Millis  `json:"at"`
}

type DriverTrack struct {
	Callsign string       `json:"callsign"`
	Points   []TrackPoint `json:"points"`
}

// IncomingCall is the telephony screen pop pushed to consoles.
type IncomingCall struct {
	CallID   string    `json:"callId"`
	Phone    string    `json:"phone"`
	At       Millis    `json:"at"`
	Customer *Customer `json:"customer"`
	Ended    bool      `json:"ended"`
}
