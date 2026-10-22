# Fleetline dispatch console (UI phase)

Keyboard-first dispatch console for UK private hire fleets. This phase is the front end only.
All data is placeholder: a seeded dataset and a client-side simulator stand in for the backend.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc, strict mode
npm run lint
npm run build && npm start
```

Node 20.9 or newer. Map tiles (CARTO) and the Barlow font load from the internet at runtime.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | As requested |
| State | Redux Toolkit + react-redux | One store for jobs, drivers, form, UI |
| Shortcuts | react-hotkeys-hook | F-keys work inside inputs |
| Map | Leaflet (no React wrapper) | Imperative marker diffing, no re-render per car |
| Styling | CSS Modules + CSS custom properties | Zero runtime, no UI library |
| Table | Own 40-line virtualizer (`useVirtualRows`) | Thousands of rows, no table library |

Runtime dependencies: next, react, react-dom, @reduxjs/toolkit, react-redux, react-hotkeys-hook, leaflet. Nothing else.

## Structure

```
src/
  app/                  layout, page, global tokens (globals.css)
  config/               app + simulator settings, status language, keymap
  types/domain.ts       Job, Driver, Stop, Zone... (mirrors the planned Postgres schema)
  lib/                  pure helpers: geo, fare, time (fleet time zone), format, focus registry
  mock/                 places, zones, seeded customers/drivers/jobs (invented data only)
  store/
    slices/             jobs, fleet (drivers, zones, clock), booking, ui, comms
    selectors.ts        tab buckets, sorting, nearest driver, quotes (all memoized)
    thunks/             booking, job actions, simulation   <- replace with API calls
  hooks/                useSimulation, useConsoleHotkeys, useVirtualRows
  components/
    ui/                 primitives: Button, TextField, pills, chips, Icon set
    layout/             TopBar, Clock
    booking/            BookingPanel, BookingInput (Redux-bound input), AddressField (combobox)
    helper/             nearest car, fare meter, driver queues
    map/                MapPanel + MapController (all Leaflet code lives here)
    jobs/               JobsPanel, JobGrid, columns.tsx (single column definition)
    overlays/           Drawer (job + counter views), ShortcutSheet, Toasts
```

## Where the backend plugs in

| Today (placeholder) | Replace with |
| --- | --- |
| `thunks/simulation.ts` `simulationTick` | Socket subscription that dispatches the same `simulationApplied` action |
| `thunks/booking.ts` `saveBooking` | `POST /jobs`, keep the client validation |
| `thunks/booking.ts` `lookupCaller` | `GET /customers/lookup?phone=` |
| `AddressField` `searchPlaces` | `GET /places/search?q=` (Google Places or Ideal Postcodes) |
| `thunks/jobActions.ts` | `POST /jobs/:id/{pause,resume,assign,cancel,noshow}` |
| `slices/commsSlice.ts` | Telephony and chat counters from the realtime channel |
| `lib/fare.ts` | Server fare engine (keep the client copy for instant quotes) |

The `simulationApplied` action is the realtime contract: one batched message per tick with job
updates, driver updates and events. Keep that shape and the UI does not change.

## Keyboard

All keys live in `src/config/keymap.ts`; the handlers, placeholder hints and the `?` sheet read
from it. F1 save, F2 pickup, F2 F2 destination, F4 name, F4 F4 phone, F6 search, F8 clear,
F10 via, Alt+1/2/3 tariff, Esc close. Enter never saves, by design.

## Design decisions

- Status colours follow UK road-sign logic (go green, motorway blue, warning amber, stop red)
  and are shared by grid, map, legend and drawer through `config/status.ts`.
- Amber is reserved for the fare meter, computed values and the Save action.
- Status is always colour plus text, never colour alone.
- Phone numbers are masked in the grid; the full number shows only in the job panel.
- Typed times are read as UK fleet time, so an operator in another time zone books correctly.
- Desktop only: 1280 px minimum, tuned for 1366 x 768 and 1920 x 1080.

## Demo controls

Top right of the second bar: **Feed** adds an app booking every 25 s, **Pause** freezes the
simulation, **Reset** reloads the seed. Seed data is invented; phone numbers use Ofcom's
drama range (07700 900xxx).
