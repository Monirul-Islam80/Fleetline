import { createSelector } from "@reduxjs/toolkit";
import { DISPATCHABLE, UNASSIGNED, type JobTab } from "@/config/status";
import { quoteFares, routeMiles } from "@/lib/fare";
import { etaMinutes, roadMiles } from "@/lib/geo";
import { toStop } from "@/lib/stops";
import { placeById, zoneName } from "@/mock/geography";
import type { Driver, FareQuote, Job, LatLng, Stop } from "@/types/domain";
import type { RootState } from "./index";
import { driversAdapter } from "./slices/fleetSlice";
import { jobsAdapter } from "./slices/jobsSlice";
import type { SortKey } from "./slices/uiSlice";

const jobSelectors = jobsAdapter.getSelectors((s: RootState) => s.jobs);
const driverSelectors = driversAdapter.getSelectors((s: RootState) => s.fleet.drivers);

export const selectAllJobs = jobSelectors.selectAll;
export const selectAllDrivers = driverSelectors.selectAll;
export const selectDriverEntities = driverSelectors.selectEntities;
export const selectZones = (s: RootState) => s.fleet.zones;
export const selectCustomers = (s: RootState) => s.fleet.customers;

/** The clock rounded to the minute, so lists that only show minutes do not recompute every second. */
export const selectNowMinute = (s: RootState) => Math.floor(s.fleet.now / 60_000) * 60_000;

const LIVE = new Set(["NEW", "PAUSED", "BIDDING", "ENROUTE", "ARRIVED", "POB", "DROPPINGOFF"]);

function tabOf(job: Job, now: number, windowMs: number): JobTab | null {
  if (LIVE.has(job.status)) return "dispatch";
  if (job.status === "BOOKED") return job.pickupAt <= now + windowMs ? "prebooked" : "booked";
  if (job.status === "COMPLETED") return "completed";
  if (job.status === "CANCELLED") return "cancelled";
  if (job.status === "NOSHOW") return "noshow";
  return null;
}

export type TabBuckets = Record<JobTab, Job[]>;

/** Every job sorted into its tab in one pass. Tab counts and grid rows both read from this. */
export const selectTabBuckets = createSelector(
  [selectAllJobs, selectNowMinute, (s: RootState) => s.ui.windowHours, (s: RootState) => s.ui.siteIds],
  (jobs, now, windowHours, siteIds): TabBuckets => {
    const buckets: TabBuckets = { dispatch: [], prebooked: [], booked: [], completed: [], cancelled: [], noshow: [], network: [], flights: [] };
    const sites = new Set(siteIds);
    for (const job of jobs) {
      if (!sites.has(job.siteId)) continue;
      const tab = tabOf(job, now, windowHours * 3_600_000);
      if (tab) buckets[tab].push(job);
    }
    return buckets;
  },
);

export const selectTabCounts = createSelector([selectTabBuckets, (s: RootState) => s.inbox.flights.length], (b, flights) => {
  const counts = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length])) as Record<JobTab, number>;
  return { ...counts, flights };
});

const SORT_VALUE: Record<SortKey, (job: Job) => string | number> = {
  time: (j) => j.pickupAt,
  priority: (j) => j.priority,
  status: (j) => j.status,
  pickup: (j) => j.pickup.label,
  dropoff: (j) => j.dropoff?.label ?? "",
  name: (j) => j.customerName,
  zone: (j) => zoneName(j.pickup.zoneId),
};

/** Grid rows for the open tab after the toolbar filters and sort. */
export const selectVisibleJobs = createSelector([selectTabBuckets, (s: RootState) => s.ui], (buckets, ui): Job[] => {
  const { recurring } = ui.filters;
  const rows = buckets[ui.tab].filter((j) => recurring || !j.isRecurring);
  const value = SORT_VALUE[ui.sort.key];
  const dir = ui.sort.dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    return va === vb ? a.number - b.number : (va < vb ? -1 : 1) * dir;
  });
});

export const isOverdue = (job: Job, now: number): boolean => UNASSIGNED.has(job.status) && job.pickupAt < now;

export const selectDriverLists = createSelector([selectAllDrivers], (drivers) => ({
  parked: drivers.filter((d) => d.status === "PARKED").sort((a, b) => a.statusSince - b.statusSince),
  dropping: drivers.filter((d) => d.status === "DROPPING"),
  bidding: drivers.filter((d) => d.status === "AVAILABLE"),
  away: drivers.filter((d) => d.status === "AWAY"),
  online: drivers.filter((d) => d.status !== "AWAY"),
}));

/** Parked drivers, longest wait first: the "Plot Waiting Times" panel. */
export const selectWaitingTimes = createSelector([selectDriverLists], (lists) => [...lists.parked].sort((a, b) => a.statusSince - b.statusSince));

/** Drivers grouped by zone in queue order: the Parking screen. */
export const selectZoneQueues = createSelector([selectAllDrivers, selectZones], (drivers, zones) =>
  zones.map((zone) => ({
    zone,
    drivers: drivers.filter((d) => d.zoneId === zone.id && (d.status === "PARKED" || d.status === "AVAILABLE")).sort((a, b) => a.statusSince - b.statusSince),
  })),
);

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
  (pickup, passengers, drivers): NearestDriver | null => (pickup ? (rankDrivers(pickup, drivers, Number(passengers) || 1)[0] ?? null) : null),
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
    const miles = routeMiles([pickup, ...vias.flatMap((v) => (v.stop ? [v.stop] : [])), dropoff]);
    return { miles, durationMin: etaMinutes(miles), quotes: quoteFares(miles) };
  },
);

export const selectFlaggedZones = createSelector([selectZones], (zones) => zones.filter((z) => z.surge || z.fullyBooked));

export const selectUnreadStaff = createSelector([(s: RootState) => s.inbox.staffMessages, (s: RootState) => s.inbox.staffReadAt], (messages, readAt) =>
  messages.filter((m) => m.at > readAt).length,
);

export const selectCaller = createSelector([(s: RootState) => s.booking.form.customerId, selectCustomers], (id, customers) =>
  id ? (customers.find((c) => c.id === id) ?? null) : null,
);

/** The matched caller's recent places, offered first in the address lists. */
export const selectCallerRecentStops = createSelector([selectCaller], (caller): Stop[] =>
  (caller?.recentPlaceIds ?? []).flatMap((pid) => {
    const place = placeById(pid);
    return place ? [toStop(place)] : [];
  }),
);

export const selectSelectedJob = (s: RootState): Job | undefined => (s.ui.selectedJobId ? s.jobs.entities[s.ui.selectedJobId] : undefined);
