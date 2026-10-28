# Fleetline API

Go backend for the Fleetline dispatch console. It serves every route in the endpoint list (269 routes,
see `ROUTES.md`), pushes live changes to consoles over WebSocket, and runs the 15-second auto-offer engine.

**Stack:** Go 1.24, Gin, sqlx + pgx, PostgreSQL 16 + PostGIS 3.4, Redis 7, Gorilla WebSocket.

## Run

```bash
docker compose up --build          # PostGIS + Redis + API on :8080, demo fleet loaded
```

Or against your own Postgres (with PostGIS) and Redis:

```bash
cp .env.example .env               # defaults work locally
make run
```

Then start the console in live mode (in `fleetline-console`):

```bash
cp .env.example .env.local && npm run dev    # http://localhost:3000
```

On first start with an empty database the server loads the same demo fleet the console's mock mode uses
(34 drivers, 132 jobs, inbox), timed relative to now. `POST /api/v1/admin/reset-demo` reloads it.

## How it fits together

```
 Console (Next.js) ──REST /api/v1──▶ Gin handlers ──▶ dispatch.Service ──▶ Postgres + PostGIS
        ▲                                   │                │ (row locks, one tx per change)
        │ WebSocket                         │                ▼
        └──── realtime.Hub ◀── Redis Pub/Sub ◀── realtime.Publisher (merges changes every 250 ms)
                                             
 Driver app ──POST /drivers/:id/location──▶ Redis (GPS, every 5 s) ──flush every 2 s──▶ PostGIS
 Phone system ──POST /cli/pickup──▶ screen pop on every console
```

| Package | Job |
| --- | --- |
| `internal/dispatch` | Every job and driver state change. Operator actions, driver-app actions, the offer engine |
| `internal/store` | All SQL. Each entity keeps its full JSON in `doc` plus indexed columns |
| `internal/realtime` | Publisher (coalesces changes, publishes to Redis) and Hub (WebSocket clients) |
| `internal/live` | Redis: GPS positions, booking edit locks, leader lease |
| `internal/api` | Routes, auth, request parsing. `catalog.go` is the endpoint list |
| `internal/sim` | Demo driver bots. They call the same methods a real driver app does |
| `internal/webhooks` | Delivers booking events to URLs registered with `POST /events/listeners` |
| `internal/seed` | Demo fleet |

### The offer engine

One goroutine, driven by four channels (no queue library):

- **ticker (1 s):** releases pre-bookings at pickup minus lead time, recovers lost offer timers, offers waiting jobs.
- **nudge:** a job was created or a driver freed, so it offers immediately instead of waiting for the tick.
- **expiries:** `time.AfterFunc(15s)` sends the job id here. Unanswered offer becomes a miss, then re-offers.
- **responses:** a driver accepted or rejected, sent with a reply channel so the HTTP call gets the result.

Ranking is a PostGIS nearest-neighbour query: free drivers (AVAILABLE or PARKED) with enough seats,
excluding callsigns the job excludes or that already missed it. After 3 misses the job opens to bids;
a job with a designated driver waits for that driver and never opens to bids.

**Running several servers:** consoles on any instance see every change (Redis Pub/Sub). Only one instance
dispatches, held by a Redis lease renewed each tick. Kill it and another takes over within about 3 seconds
(tested). Every change runs under Postgres row locks, so two instances can never double-assign a driver.

### Zones

Zones are PostGIS polygons. Seeded zones are circles turned into polygons; `POST /zones/bulk` takes
centre and radius today. Point-in-polygon (`ZoneAt`) fills in job zones, pricing zones and parked-driver zones.

## Realtime contract

The socket at `/api/v1/ws` sends the console's `RealtimeBatch` (`src/store/actions.ts`), plus three
optional fields only the live backend sends:

| Field | Meaning |
| --- | --- |
| `added` | Jobs created elsewhere (other operators, passenger app, IVR) |
| `removed` | Job ids deleted |
| `calls` | Incoming calls for the screen pop |

A heartbeat batch every second keeps console clocks moving.

## Driver app endpoints

Sign in with `POST /drivers/authenticate {"callsign","pin"}`, then send the bearer token. `:id` is the driver id.

| Call | Body |
| --- | --- |
| `POST /drivers/:id/location` | `{"lat","lng"}` every 5 s |
| `POST /drivers/:id/offer` | `{"bookingId","accept":true}` |
| `POST /drivers/:id/trip` | `{"status":"ARRIVED"}` then `POB`, `DROPPINGOFF`, `COMPLETED` (or `NOSHOW`) |
| `POST /drivers/:id/presence` | `{"status":"AVAILABLE"}`, `PARKED` or `AWAY` |
| `POST /drivers/:id/bid` | `{"bookingId"}` for jobs open to bids |
| `GET /drivers/:id/booking` | Current job or pending offer |

## Telephony

Point the provider's webhooks at `POST /api/v1/cli/pickup` and `/cli/hangup`, with
`X-Webhook-Secret` (or `?secret=`). Twilio form posts (`From`, `CallSid`) and JSON from Aircall or an
Amazon Connect Lambda are all read. The `ivr` group serves automated phone flows.

## Auth

| Caller | How |
| --- | --- |
| Operators / integrations | `X-API-Key` from `API_KEYS`, or a token made with `POST /clienttokens` |
| Drivers | Bearer token from `/drivers/authenticate`; can act only as themselves |
| Passengers | Bearer token from `/users/authenticate`; can book, quote and see their own profile |
| Browser WebSocket | `?token=` (get one from `GET /fleetengine/jwt`) |

With `AUTH_REQUIRED=false` (the demo default) anonymous calls act as the default operator.

## Tests

```bash
make run            # in one terminal
make e2e            # in another
```

`test/e2e_test.go` runs every console call in `src/api/live.ts`, a full driver-app trip, a Twilio-style
screen pop over the socket, and calls all 269 routes checking none returns a server error.

## Before production

| Item | Today | Needed |
| --- | --- | --- |
| Auth | Off by default; demo driver PIN and passenger code | `AUTH_REQUIRED=true`, per-driver credentials, SMS verification, real identity provider |
| Webhook signatures | Shared secret | Twilio `X-Twilio-Signature` validation per provider |
| Driver app delivery | Messages and offers stored and readable by the app | Push notifications (FCM/APNs) |
| Card payments | Stores provider token and last4 only, rejects card numbers | Payment provider integration (Stripe, Adyen) |
| Zones | Circles | Import real polygons |
| Generic groups | Account fields, custom fields, surge schedules, items, client tokens and similar are stored as JSON with full CRUD | Typed tables once their rules are known |
| Surge schedules | Stored with full CRUD; surge is switched on per zone with `POST /surge/price` | A timer that applies schedules automatically |
| Simulator | On by default | `SIM_DRIVERS=false` once real apps connect |
