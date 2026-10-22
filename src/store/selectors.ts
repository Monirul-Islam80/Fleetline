import { createSelector } from "@reduxjs/toolkit";
import { DISPATCHABLE, UNASSIGNED, type JobTab } from "@/config/status";
import { quoteFares, routeMiles } from "@/lib/fare";
import { digitsOnly } from "@/lib/format";
import { etaMinutes, roadMiles } from "@/lib/geo";
import { placeById } from "@/mock/geography";
import { toStop } from "@/lib/stops";
import type { Driver, FareQuote, Job, LatLng, Stop } from "@/types/domain";
import type { RootState } from "./index";
import { driversAdapter } from "./slices/fleetSlice";
import { jobsAdapter } from "./slices/jobsSlice";
import type { SortKey } from "./slices/uiSlice";

const jobSelectors = jobsAdapter.getSelectors((s: RootState) => s.jobs);
const driverSelectors = driversAdapter.getSelectors((s: RootState) => s.fleet.drivers);

export const selectAllJobs = jobSelectors.selectAll;
export const selectJobById = jobSelectors.selectById;
export const selectAllDrivers = driverSelectors.selectAll;
export const selectDriverEntities = driverSelectors.selectEntities;
export const selectDriverById = driverSelectors.selectById;
export const selectNow = (s: RootState) => s.fleet.now;
export const selectZones = (s: RootState) => s.fleet.zones;
export const selectCustomers = (s: RootState) => s.fleet.customers;
export const selectForm = (s: RootState) => s.booking.form;
export const selectUi = (s: RootState) => s.ui;

/** Rounds the clock to the minute so tab buckets do not recompute on every 1 s tick. */
const selectNowMinute = (s: RootState) => Math.floor(s.fleet.now / 60_000) * 60_000;

const DISPATCH_STATES = new Set(["NEW", "PAUSED", "BIDDING", "ENROUTE", "ARRIVED", "POB", "DROPPINGOFF"]);

function tabOf(job: Job, now: number, windowMs: number): JobTab | null {
  if (DISPATCH_STATES.has(job.status)) return "dispatch";
  switch (job.status) {
    case "BOOKED":
      return job.pickupAt <= now + windowMs ? "prebooked" : "booked";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "NOSHOW":
      return "noshow";
    default:
      return null;
  }
}

export type TabBuckets = Record<JobTab, Job[]>;

/** Every job sorted into its tab in a single pass. Counts and grid rows both read from this. */
export const selectTabBuckets = createSelector(
  [selectAllJobs, selectNowMinute, (s: RootState) => s.ui.windowHours],
  (jobs, now, windowHours): TabBuckets => {
    const buckets: TabBuckets = {
      dispatch: [],
      prebooked: [],
      booked: [],
      completed: [],
      cancelled: [],
      noshow: [],
      network: [],
      flights: [],
    };
    const windowMs = windowHours * 3_600_000;
    for (const job of jobs) {
      const tab = tabOf(job, now, windowMs);
      if (tab) buckets[tab].push(job);
      if (job.flightNo && (tab === "prebooked" || tab === "booked" || tab === "dispatch")) buckets.flights.push(job);
    }
    return buckets;
  },
);

export const selectTabCounts = createSelector([selectTabBuckets], (b) =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length])) as Record<JobTab, number>,
);

const sortValue = (job: Job, key: SortKey, drivers: Record<string, Driver | undefined>): string | number => {
  switch (key) {
    case "time":
      return job.pickupAt;
    case "status":
      return job.status;
    case "driver":
      return job.driverId ? (drivers[job.driverId]?.callsign ?? "") : "";
    case "pickup":
      return job.pickup.label;
    case "dropoff":
      return job.dropoff?.label ?? "";
    case "name":
      return job.customerName;
    case "fare":
      return job.fare ?? 0;
    case "zone":
      return job.pickup.zoneId ?? "";
    case "priority":
      return job.priority;
  }
};

function matchesQuery(job: Job, q: string, drivers: Record<string, Driver | undefined>): boolean {
  if (!q) return true;
  const callsign = job.driverId ? drivers[job.driverId]?.callsign : undefined;
  const qDigits = digitsOnly(q);
  return (
    String(job.number).includes(q) ||
    job.customerName.toLowerCase().includes(q) ||
    job.pickup.label.toLowerCase().includes(q) ||
    job.pickup.area.toLowerCase().includes(q) ||
    (job.dropoff?.label.toLowerCase().includes(q) ?? false) ||
    (callsign?.includes(q) ?? false) ||
    (qDigits.length >= 3 && digitsOnly(job.phone).includes(qDigits))
  );
}

/** Rows for the visible tab after filters, search and sort. */
export const selectVisibleJobs = createSelector(
  [selectTabBuckets, selectDriverEntities, (s: RootState) => s.ui],
  (buckets, drivers, ui): Job[] => {
    const q = ui.gridQuery.trim().toLowerCase();
    const { recurring, flights, accounts } = ui.filters;
    const rows = buckets[ui.tab].filter(
      (j) =>
        (recurring || !j.isRecurring) &&
        (flights || !j.flightNo) &&
        (accounts || !j.accountCode) &&
        matchesQuery(j, q, drivers),
    );
    const dir = ui.sort.dir === "asc" ? 1 : -1;
    // Completed work reads newest first by default.
    const timeDir = ui.sort.key === "time" && (ui.tab === "completed" || ui.tab === "cancelled" || ui.tab === "noshow") ? -dir : dir;
    return rows.sort((a, b) => {
      const va = sortValue(a, ui.sort.key, drivers);
      const vb = sortValue(b, ui.sort.key, drivers);
      if (va === vb) return a.number - b.number;
      return (va < vb ? -1 : 1) * (ui.sort.key === "time" ? timeDir : dir);
    });
  },
);

export const isOverdue = (job: Job, now: number): boolean => UNASSIGNED.has(job.status) && job.pickupAt < now;

export const selectDriverLists = createSelector([selectAllDrivers, selectNowMinute], (drivers) => {
  const parked = drivers.filter((d) => d.status === "PARKED").sort((a, b) => a.statusSince - b.statusSince);
  const dropping = drivers.filter((d) => d.status === "DROPPING" || d.status === "POB");
  const available = drivers.filter((d) => d.status === "AVAILABLE");
  const away = drivers.filter((d) => d.status === "AWAY");
  return { parked, dropping, available, away };
});

export const selectFleetStats = createSelector([selectAllDrivers], (drivers) => {
  let free = 0;
  let busy = 0;
  let away = 0;
  for (const d of drivers) {
    if (DISPATCHABLE.has(d.status)) free += 1;
    else if (d.status === "AWAY") away += 1;
    else busy += 1;
  }
  return { free, busy, away, total: drivers.length };
});

export interface NearestDriver {
  driver: Driver;
  miles: number;
  etaMin: number;
}

/** Closest free drivers to a point, best first. */
export function rankDrivers(point: LatLng, drivers: readonly Driver[], minSeats = 1, exclude: readonly string[] = []): NearestDriver[] {
  return drivers
    .filter((d) => DISPATCHABLE.has(d.status) && d.seats >= minSeats && !exclude.includes(d.callsign))
    .map((driver) => {
      const miles = roadMiles(point, driver);
      return { driver, miles, etaMin: etaMinutes(miles) };
    })
    .sort((a, b) => a.miles - b.miles);
}

export const selectNearestForForm = createSelector(
  [(s: RootState) => s.booking.form.pickup, (s: RootState) => s.booking.form.passengers, selectAllDrivers],
  (pickup, passengers, drivers): NearestDriver[] =>
    pickup ? rankDrivers(pickup, drivers, Number(passengers) || 1).slice(0, 3) : [],
);

export interface FormQuote {
  miles: number;
  durationMin: number;
  quotes: FareQuote[];
}

export const selectFormQuote = createSelector(
  [(s: RootState) => s.booking.form.pickup, (s: RootState) => s.booking.form.dropoff, (s: RootState) => s.booking.form.vias],
  (pickup, dropoff, vias): FormQuote | null => {
    if (!pickup || !dropoff) return null;
    const miles = routeMiles([pickup, ...vias, dropoff]);
    return { miles, durationMin: etaMinutes(miles), quotes: quoteFares(miles) };
  },
);

/** Alerts are missed offers, bidding and no-shows raised since the drawer was last opened. */
export const selectAlerts = createSelector([(s: RootState) => s.jobs.events], (events) =>
  events.filter((e) => e.type === "MISSED" || e.type === "NOSHOW" || (e.type === "STATUS" && e.text.includes("bid"))),
);

export const selectUnreadAlertCount = createSelector(
  [selectAlerts, (s: RootState) => s.ui.alertsReadAt],
  (alerts, readAt) => alerts.filter((a) => a.at > readAt).length,
);

export const selectFlaggedZones = createSelector([selectZones], (zones) => zones.filter((z) => z.surge || z.fullyBooked));

export const selectJobEvents = createSelector(
  [(s: RootState) => s.jobs.events, (_: RootState, jobId: string) => jobId],
  (events, jobId) => events.filter((e) => e.jobId === jobId),
);

export const selectCaller = createSelector(
  [(s: RootState) => s.booking.form.customerId, selectCustomers],
  (id, customers) => (id ? (customers.find((c) => c.id === id) ?? null) : null),
);

/** The matched caller's recent places, offered first in the address lists. */
export const selectCallerRecentStops = createSelector([selectCaller], (caller): Stop[] =>
  (caller?.recentPlaceIds ?? []).flatMap((pid) => {
    const place = placeById(pid);
    return place ? [toStop(place)] : [];
  }),
);
