# Fleetline dispatch console

Same screen layout, wording and keyboard keys as the console Western Cars uses today, with a new
colour system. Runs on placeholder data (mock mode) or against the Go backend (live mode).

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck && npm run lint && npm run build
```

Pages: `/` operator console (Dispatch, Bookings, Drivers, Logs), `/wallboard`, `/parking`, `/playback`.
The header icons open the last three in a new tab, as today.

Wallboard tiles can be dragged to any position (or moved with the grip button and arrow keys),
hidden with the x, and restored with Reset layout. `useTileLayout` (src/hooks) does this for any grid
of tiles. The layout is saved in the browser for that screen; move it to a user-settings endpoint if it
should follow the operator between machines.

## Stack

Next.js 16 (App Router), React 19, TypeScript strict, Redux Toolkit, react-hotkeys-hook, Leaflet.
No UI library: CSS Modules + CSS variables (`src/app/globals.css`). One table component, one form-config
component, one modal, one floating panel; every screen is built from those.

## Connecting the backend (the part to read)

Everything the UI asks of the server goes through **one interface**: `src/api/client.ts`.

| File | What it is |
| --- | --- |
| `src/api/client.ts` | `ApiClient`: every call (create job, job actions, searches, messages, playback...) |
| `src/api/live.ts` | The REST contract: one line per endpoint. Implement these on the server |
| `src/api/mock.ts` | Same interface answered from seed data in the browser |
| `src/api/realtime.ts` | Live feed. `live` = WebSocket; `mock` = the in-browser engine |
| `src/api/mockEngine.ts` | Placeholder dispatch engine (offers, drivers moving). Delete when live |
| `src/types/api.ts` | Request/response shapes, `Snapshot` (initial load) |
| `src/store/actions.ts` | `RealtimeBatch`: the one message shape the socket must send |

Switch to the Go backend (`fleetline-api`) with `.env.local` (copy `.env.example`):

```
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=/api                          # proxied to BACKEND_URL/api/v1 by next.config.ts
BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/api/v1/ws
```

Rules that keep it simple:
- Components never call `fetch`. Writes are thunks in `src/store/thunks/*` (call API, then update the store).
  Reads use `useApi((api) => api.searchX(query))`, which tracks loading and errors.
- The store is `jobs`, `fleet` (drivers, zones, customers), `booking` (the form), `inbox` (counter panels), `ui`.
- `live.ts` maps each console call to the endpoint-list route (e.g. createJob is `POST /bookings/add`,
  job actions are `/bookings/:id/{pause|unpause|cancel|status|dispatch}`). The full route list is in
  `fleetline-api/ROUTES.md`.
- In live mode the socket also sends `added` (jobs booked elsewhere), `removed` and `calls`. An incoming call
  fills the phone box when the form is empty and runs caller ID. The socket reconnects with backoff and
  reloads the snapshot after a drop.
- Operator actions add their timeline event at once; the server's copy of the same event is skipped
  (`isEcho` in `jobsSlice.ts`), so it shows once.

## Where things are

```
src/config/      app settings, sites, status colours, keymap (all keys in one table)
src/components/
  ui/            Button, Toggle, Input, Select, DataTable, Modal, FloatPanel, Calendar, Icon
  shell/         header rows and the operator console frame
  dispatch/      booking form, driver lists + fare, map, extra fields, waiting times, job grid, via + options modals
  panels/        staff messages, call queue, driver chat, driver message, alerts, flights, zones, sites, settings
  views/         Bookings, Drivers, Logs (search forms are config in QueryForm)
  pages/         Wallboard, Parking, Playback
```

## Keys

F1 save, F2 / double F2 pickup / destination, F4 / double F4 name / phone, F6 booking search, F8 clear,
F10 via stops, Alt+L lead time, Alt+R recurring, Alt+D/W/E tariffs, Esc closes the top panel.
Right-click a job row for actions (allocate, pause, resume, re-dispatch, copy, no show, cancel).

## Placeholders to know about

- Demo data is invented (07700 900xxx phone numbers). Settings (wrench icon) can pause, stop the app
  booking feed, or reset.
- Wallboard averages (dispatch, pickup, POB time) and "last week" are placeholders for a reports endpoint.
- Map tiles: CARTO (map) and Esri (satellite) free tiles; get a commercial key before production.
