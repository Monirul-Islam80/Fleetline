// Package fleet holds the business rules shared by handlers, the dispatch engine and the simulator:
// distances, fares, fleet time and ids. Each one mirrors the console's src/lib helper of the same name,
// so a quote or an ETA is the same number on both sides.
package fleet

import (
	"crypto/rand"
	"encoding/hex"
	"math"
	"strings"
	"time"
	_ "time/tzdata" // fleet time zone works in minimal containers too

	"fleetline/api/internal/domain"
)

const (
	earthRadiusM  = 6_371_000.0
	metresPerMile = 1609.344
	roadFactor    = 1.3 // straight line to road distance, UK suburban average
	avgRoadMph    = 24.0
)

func rad(deg float64) float64 { return deg * math.Pi / 180 }

// DistanceM is the great-circle distance in metres.
func DistanceM(a, b domain.LatLng) float64 {
	dLat := rad(b.Lat - a.Lat)
	dLng := rad(b.Lng - a.Lng)
	h := math.Pow(math.Sin(dLat/2), 2) + math.Cos(rad(a.Lat))*math.Cos(rad(b.Lat))*math.Pow(math.Sin(dLng/2), 2)
	return 2 * earthRadiusM * math.Asin(math.Sqrt(h))
}

func RoadMiles(a, b domain.LatLng) float64 { return DistanceM(a, b) * roadFactor / metresPerMile }

func EtaMinutes(miles float64) int {
	return int(math.Max(1, math.Round(miles/avgRoadMph*60)))
}

// StepTowards moves `from` towards `to` by stepM metres, or returns `to` when closer than that.
func StepTowards(from, to domain.LatLng, stepM float64) domain.LatLng {
	total := DistanceM(from, to)
	if total <= stepM || total == 0 {
		return to
	}
	t := stepM / total
	return domain.LatLng{Lat: from.Lat + (to.Lat-from.Lat)*t, Lng: from.Lng + (to.Lng-from.Lng)*t}
}

// Jitter returns a random point within radiusM of centre.
func Jitter(centre domain.LatLng, radiusM float64, rnd func() float64) domain.LatLng {
	r := radiusM * math.Sqrt(rnd())
	theta := rnd() * 2 * math.Pi
	return domain.LatLng{
		Lat: centre.Lat + r*math.Cos(theta)/111_320,
		Lng: centre.Lng + r*math.Sin(theta)/(111_320*math.Cos(rad(centre.Lat))),
	}
}

/* ---------- Fares (src/lib/fare.ts, src/config/app.ts TARIFFS) ---------- */

type Tariff struct {
	ID      string  `json:"id"`
	Label   string  `json:"label"`
	Base    float64 `json:"base"`
	PerMile float64 `json:"perMile"`
	Minimum float64 `json:"minimum"`
}

var Tariffs = []Tariff{
	{ID: "standard", Label: "Standard", Base: 3.5, PerMile: 2.2, Minimum: 6},
	{ID: "large", Label: "Large car", Base: 4.5, PerMile: 2.75, Minimum: 8},
	{ID: "exec", Label: "Executive", Base: 6, PerMile: 3.4, Minimum: 12},
}

// SurgeMultiplier applies to every tariff when the pickup zone is surging.
const SurgeMultiplier = 1.5

func RouteMiles(points []domain.LatLng) float64 {
	miles := 0.0
	for i := 1; i < len(points); i++ {
		miles += RoadMiles(points[i-1], points[i])
	}
	return miles
}

func QuoteFares(miles float64, multiplier float64) []domain.FareQuote {
	out := make([]domain.FareQuote, 0, len(Tariffs))
	for _, t := range Tariffs {
		price := math.Max(t.Minimum, t.Base+t.PerMile*miles) * multiplier
		out = append(out, domain.FareQuote{TariffID: t.ID, Label: t.Label, Price: math.Round(price*10) / 10})
	}
	return out
}

// TariffFor picks the tariff a vehicle type books on.
func TariffFor(vehicle string) int {
	switch vehicle {
	case "EXEC":
		return 2
	case "MPV", "ESTATE":
		return 1
	}
	return 0
}

// Vehicles is src/config/app.ts VEHICLES.
var Vehicles = map[string]struct {
	Label string `json:"label"`
	Code  string `json:"code"`
	Seats int    `json:"seats"`
}{
	"SALOON": {"Saloon", "", 4},
	"ESTATE": {"Estate", "E", 4},
	"MPV":    {"MPV 6", "M6", 6},
	"EXEC":   {"Executive", "X1", 4},
	"WAV":    {"Wheelchair", "W", 4},
}

/* ---------- Fleet time (src/lib/time.ts) ---------- */

// Location is the fleet's wall-clock zone. Operators type times in fleet time, never their own.
var Location = mustLoad("Europe/London")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

func SetLocation(name string) {
	if loc, err := time.LoadLocation(name); err == nil {
		Location = loc
	}
}

func NowMillis() domain.Millis { return time.Now().UnixMilli() }

// ParseFleetDate reads "today", "tomorrow"/"tmr", "+2", "dd/mm" or "dd/mm/yyyy" (empty means today).
func ParseFleetDate(text string, now domain.Millis) (time.Time, bool) {
	today := time.UnixMilli(now).In(Location)
	day := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, Location)
	t := strings.ToLower(strings.TrimSpace(text))
	switch {
	case t == "" || t == "today":
		return day, true
	case t == "tomorrow" || t == "tmr":
		return day.AddDate(0, 0, 1), true
	case strings.HasPrefix(t, "+"):
		n, ok := atoi(t[1:])
		if !ok || n > 99 {
			return time.Time{}, false
		}
		return day.AddDate(0, 0, n), true
	}
	parts := strings.FieldsFunc(t, func(r rune) bool { return r == '/' || r == '.' || r == '-' })
	if len(parts) < 2 || len(parts) > 3 {
		return time.Time{}, false
	}
	d, ok1 := atoi(parts[0])
	m, ok2 := atoi(parts[1])
	y := today.Year()
	ok3 := true
	if len(parts) == 3 {
		y, ok3 = atoi(parts[2])
		if len(parts[2]) == 2 {
			y += 2000
		}
	}
	if !ok1 || !ok2 || !ok3 {
		return time.Time{}, false
	}
	out := time.Date(y, time.Month(m), d, 0, 0, 0, 0, Location)
	if out.Day() != d || int(out.Month()) != m {
		return time.Time{}, false
	}
	return out, true
}

// DayRange returns the first and last millisecond of a fleet day typed as text.
func DayRange(text string, now domain.Millis) (start, end domain.Millis, ok bool) {
	day, ok := ParseFleetDate(text, now)
	if !ok {
		return 0, 0, false
	}
	return day.UnixMilli(), day.AddDate(0, 0, 1).UnixMilli() - 1, true
}

// DayRangeAt returns the fleet day containing `at`.
func DayRangeAt(at domain.Millis) (start, end domain.Millis) {
	t := time.UnixMilli(at).In(Location)
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Location)
	return day.UnixMilli(), day.AddDate(0, 0, 1).UnixMilli() - 1
}

// HHMM reads "1430" as an offset from midnight in milliseconds.
func HHMM(text string) (domain.Millis, bool) {
	if len(text) != 4 {
		return 0, false
	}
	h, ok1 := atoi(text[:2])
	m, ok2 := atoi(text[2:])
	if !ok1 || !ok2 || h > 23 || m > 59 {
		return 0, false
	}
	return domain.Millis((h*60 + m) * 60_000), true
}

func atoi(s string) (int, bool) {
	if s == "" {
		return 0, false
	}
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	return n, true
}

/* ---------- Small helpers ---------- */

// NewID returns a prefixed random id, e.g. "job_3f9a1c2b7d4e5f60".
func NewID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

func Digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Has is the console's case-insensitive "contains, or no filter" test.
func Has(value, needle string) bool {
	return needle == "" || strings.Contains(strings.ToLower(value), strings.ToLower(needle))
}

func Ptr[T any](v T) *T { return &v }

func Deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
