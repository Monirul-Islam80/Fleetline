// End-to-end tests against a running server (make run, or docker compose up).
//
//	API_URL=http://localhost:8080 go test ./test -v
//
// They use the demo data and change it, so point them at a demo database, never production.
package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"fleetline/api/internal/api"
	"fleetline/api/internal/config"
)

func base(t *testing.T) string {
	url := os.Getenv("API_URL")
	if url == "" {
		url = "http://localhost:8080"
	}
	if _, err := http.Get(url + "/healthz"); err != nil {
		t.Skip("no server at " + url)
	}
	return url
}

type client struct {
	t     *testing.T
	base  string
	token string
}

func (c client) do(method, path string, body any) (int, []byte) {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, c.base+"/api/v1"+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, out
}

func (c client) json(method, path string, body any, want int, into any) {
	c.t.Helper()
	status, raw := c.do(method, path, body)
	if status != want {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, status, want, raw)
	}
	if into != nil {
		if err := json.Unmarshal(raw, into); err != nil {
			c.t.Fatalf("%s %s: decode: %v (%s)", method, path, err, raw)
		}
	}
}

type job struct {
	ID       string  `json:"id"`
	Number   int64   `json:"number"`
	Status   string  `json:"status"`
	DriverID *string `json:"driverId"`
	Offer    *struct {
		DriverID string `json:"driverId"`
	} `json:"offer"`
}

type batch struct {
	Now     int64                 `json:"now"`
	Jobs    []struct{ ID string } `json:"jobs"`
	Drivers []struct{ ID string } `json:"drivers"`
	Added   []job                 `json:"added"`
	Events  []struct{ Type, JobID string }
	Calls   []struct{ Phone string } `json:"calls"`
}

// socket collects realtime batches in the background.
func socket(t *testing.T, url string) (<-chan batch, func()) {
	ws := "ws" + strings.TrimPrefix(url, "http") + "/api/v1/ws"
	conn, _, err := websocket.DefaultDialer.Dial(ws, http.Header{"Origin": {"http://localhost:3000"}})
	if err != nil {
		t.Fatalf("websocket: %v", err)
	}
	out := make(chan batch, 1000)
	go func() {
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				close(out)
				return
			}
			var b batch
			if json.Unmarshal(raw, &b) == nil {
				out <- b
			}
		}
	}()
	return out, func() { conn.Close() }
}

func waitFor(t *testing.T, feed <-chan batch, what string, match func(batch) bool) {
	t.Helper()
	deadline := time.After(10 * time.Second)
	for {
		select {
		case b, ok := <-feed:
			if !ok {
				t.Fatalf("socket closed while waiting for %s", what)
			}
			if match(b) {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s", what)
		}
	}
}

var stop = map[string]any{"label": "East Grinstead Station", "area": "East Grinstead", "postcode": "RH19", "zoneId": "eg", "lat": 51.1265, "lng": -0.0178}
var drop = map[string]any{"label": "Crawley Station", "area": "Crawley", "postcode": "RH10", "zoneId": "cr", "lat": 51.1123, "lng": -0.1866}

func booking(extra map[string]any) map[string]any {
	in := map[string]any{
		"pickupAt": time.Now().UnixMilli(), "leadMin": 15, "priority": 5, "passengers": 1, "taxis": 1,
		"vehicle": "SALOON", "extras": "", "pickup": stop, "vias": []any{}, "dropoff": drop,
		"customerName": "test caller", "phone": "07700 900111", "altPhone": "", "email": nil,
		"instructions": "", "customerNotes": "", "operatorNotes": "", "excludeDrivers": []string{},
		"accountCode": nil, "payment": "CASH", "source": "PHONE", "siteId": "wc", "fare": nil,
		"fareOverridden": false, "designatedCallsign": nil,
		"options": map[string]any{"sendSms": true, "sendRingback": false, "autoComplete": false},
	}
	for k, v := range extra {
		in[k] = v
	}
	return in
}

// TestConsoleContract runs every call in the console's src/api/live.ts.
func TestConsoleContract(t *testing.T) {
	url := base(t)
	c := client{t: t, base: url}
	feed, closeWS := socket(t, url)
	defer closeWS()

	var snap struct {
		Jobs, Drivers, Customers, Zones []map[string]any
		NextJobNumber                   int64
		Inbox                           map[string][]map[string]any
	}
	c.json("GET", "/snapshot", nil, 200, &snap)
	if len(snap.Drivers) == 0 || len(snap.Jobs) == 0 || len(snap.Zones) == 0 {
		t.Fatalf("snapshot is empty: %d drivers, %d jobs", len(snap.Drivers), len(snap.Jobs))
	}

	// createJob: the job is returned and pushed to every console as "added".
	var j job
	c.json("POST", "/bookings/add", booking(map[string]any{"pickupAt": time.Now().Add(3 * time.Hour).UnixMilli()}), 201, &j)
	if j.Status != "BOOKED" || j.Number < snap.NextJobNumber {
		t.Fatalf("pre-booking came back as %+v", j)
	}
	waitFor(t, feed, "added job", func(b batch) bool {
		for _, a := range b.Added {
			if a.ID == j.ID {
				return true
			}
		}
		return false
	})

	// jobAction: pause, resume, cancel.
	c.json("POST", "/bookings/"+j.ID+"/pause", nil, 200, &j)
	if j.Status != "PAUSED" {
		t.Fatalf("pause gave %s", j.Status)
	}
	c.json("POST", "/bookings/"+j.ID+"/unpause", nil, 200, &j)
	c.json("POST", "/bookings/"+j.ID+"/cancel", nil, 200, &j)
	if j.Status != "CANCELLED" {
		t.Fatalf("cancel gave %s", j.Status)
	}
	if status, _ := c.do("POST", "/bookings/"+j.ID+"/cancel", nil); status != 409 {
		t.Fatalf("second cancel: status %d, want 409", status)
	}

	// The rest of live.ts.
	var customer map[string]any
	c.json("GET", "/users/lookup?phone=07700900100", nil, 200, &customer)
	if customer == nil || customer["name"] == nil {
		t.Fatalf("caller ID found nothing for a seeded number")
	}
	var places []map[string]any
	c.json("GET", "/addresses?q=crawley+st", nil, 200, &places)
	if len(places) == 0 || places[0]["label"] != "Crawley Station" {
		t.Fatalf("address search: %v", places)
	}
	var page struct {
		Items []job
		Total int
	}
	c.json("GET", "/bookings/history?from=today&to=today&siteId=ALL&source=ALL&status=ALL&page=1&pageSize=25", nil, 200, &page)
	if page.Total == 0 {
		t.Fatalf("bookings search found nothing today")
	}
	var drivers []map[string]any
	c.json("GET", "/drivers?active=ALL&siteId=ALL&version=ALL&sort=callsign", nil, 200, &drivers)
	if len(drivers) != len(snap.Drivers) {
		t.Fatalf("drivers search: %d, snapshot has %d", len(drivers), len(snap.Drivers))
	}
	var logs []map[string]any
	c.json("GET", fmt.Sprintf("/logs?day=%d&categories=OPERATOR,DRIVER,SYSTEM", time.Now().UnixMilli()), nil, 200, &logs)
	if len(logs) == 0 {
		t.Fatalf("logs are empty")
	}
	c.json("POST", "/staff/messages", map[string]any{"to": "All operators", "body": "e2e"}, 201, nil)
	c.json("POST", "/messages", map[string]any{"audience": "ALL", "message": "e2e broadcast", "type": "INFO"}, 201, nil)
	chat := snap.Inbox["driverChats"][0]["id"].(string)
	c.json("POST", "/driverchats/"+chat+"/take", nil, 204, nil)
	c.json("POST", "/driverchats/"+chat+"/done", nil, 204, nil)
	call := snap.Inbox["callQueue"][0]["id"].(string)
	c.json("POST", "/callqueue/"+call+"/take", nil, 204, nil)
	alert := snap.Inbox["alerts"][0]["id"].(string)
	c.json("DELETE", "/alerts/"+alert, nil, 204, nil)
	flight := snap.Inbox["flights"][0]["id"].(string)
	c.json("DELETE", "/flights/"+flight, nil, 204, nil)
	c.json("POST", "/zones/clearflags", nil, 204, nil)
	var tracks []map[string]any
	c.json("GET", fmt.Sprintf("/drivers/tracks?from=%d&to=%d&lat=51.125&lng=-0.03&radiusM=20000", time.Now().Add(-10*time.Minute).UnixMilli(), time.Now().UnixMilli()), nil, 200, &tracks)
}

// TestDriverAppFlow books an ASAP job, answers the offer as the driver app, and drives the trip to completion.
func TestDriverAppFlow(t *testing.T) {
	url := base(t)
	ops := client{t: t, base: url}

	// Sign in as a driver. A real app sends PIN and callsign; the demo PIN is 0000.
	var drivers []struct {
		ID, Callsign, Status string
	}
	ops.json("GET", "/drivers?active=ONLINE", nil, 200, &drivers)
	var chosen string
	for _, d := range drivers {
		if d.Status == "AVAILABLE" || d.Status == "PARKED" {
			chosen = d.Callsign
			break
		}
	}
	if chosen == "" {
		t.Skip("no free driver right now")
	}
	var login struct {
		Token  string
		Driver struct{ ID string }
	}
	ops.json("POST", "/drivers/authenticate", map[string]any{"callsign": chosen, "pin": "0000"}, 200, &login)
	app := client{t: t, base: url, token: login.Token}
	if status, _ := app.do("GET", "/snapshot", nil); status != 403 {
		t.Fatalf("driver token reached an operator endpoint: %d", status)
	}

	// Designate the job to this driver so the engine offers it to them.
	var j job
	ops.json("POST", "/bookings/add", booking(map[string]any{"designatedCallsign": chosen}), 201, &j)
	deadline := time.Now().Add(10 * time.Second)
	for j.Offer == nil && j.Status == "NEW" && time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		ops.json("GET", "/bookings/"+j.ID, nil, 200, &j)
	}
	if j.Status == "NEW" {
		if j.Offer == nil {
			t.Fatalf("engine never offered the job")
		}
		status, raw := app.do("POST", "/drivers/"+login.Driver.ID+"/offer", map[string]any{"bookingId": j.ID, "accept": true})
		if status != 204 && status != 409 { // 409: the simulator answered first, which is fine
			t.Fatalf("accept: %d %s", status, raw)
		}
	}
	ops.json("GET", "/bookings/"+j.ID, nil, 200, &j)
	if j.DriverID == nil || *j.DriverID != login.Driver.ID {
		t.Fatalf("job not with %s: %+v", chosen, j)
	}

	app.json("POST", "/drivers/"+login.Driver.ID+"/location", map[string]any{"lat": 51.1265, "lng": -0.0178}, 204, nil)
	for _, status := range []string{"ARRIVED", "POB", "COMPLETED"} {
		code, raw := app.do("POST", "/drivers/"+login.Driver.ID+"/trip", map[string]any{"status": status})
		if code != 200 && code != 409 { // 409 when the simulated driver got there first
			t.Fatalf("%s: %d %s", status, code, raw)
		}
	}
	ops.json("GET", "/bookings/"+j.ID, nil, 200, &j)
	if j.Status != "COMPLETED" {
		t.Fatalf("trip ended as %s", j.Status)
	}
}

// TestScreenPop sends a Twilio-style webhook and expects the call on the console socket.
func TestScreenPop(t *testing.T) {
	url := base(t)
	feed, closeWS := socket(t, url)
	defer closeWS()
	res, err := http.Post(url+"/api/v1/cli/pickup", "application/x-www-form-urlencoded", strings.NewReader("From=%2B447700900107&CallSid=CAe2e"))
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("pickup webhook: %v %v", err, res.Status)
	}
	waitFor(t, feed, "incoming call", func(b batch) bool { return len(b.Calls) > 0 && strings.Contains(b.Calls[0].Phone, "7700900107") })
}

// TestEveryRouteResponds calls every registered route with an empty body: none may crash (5xx).
func TestEveryRouteResponds(t *testing.T) {
	url := base(t)
	c := client{t: t, base: url}
	engine := api.New(config.Load(), nil, nil, nil, nil, nil).Handler().(*gin.Engine)
	skip := map[string]bool{"/api/v1/ws": true, "/api/v1/admin/reset-demo": true}
	count := 0
	for _, r := range engine.Routes() {
		if skip[r.Path] || !strings.HasPrefix(r.Path, "/api/v1") {
			continue
		}
		path := strings.TrimPrefix(r.Path, "/api/v1")
		for _, param := range []string{":id", ":valueId", ":extraId", ":userId", ":txId", ":siteId", ":licenceId", ":shiftId", ":fbId"} {
			path = strings.ReplaceAll(path, param, "e2e-missing")
		}
		status, raw := c.do(r.Method, path, map[string]any{})
		if status >= 500 {
			t.Errorf("%s %s: %d %s", r.Method, r.Path, status, raw)
		}
		count++
	}
	t.Logf("%d routes answered without a server error", count)
}
