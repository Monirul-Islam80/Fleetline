import { APP } from "@/config/app";
import { DISPATCHABLE } from "@/config/status";
import { digitsOnly } from "@/lib/format";
import { distanceM, jitter } from "@/lib/geo";
import { createRandom, makeId } from "@/lib/random";
import { toStop } from "@/lib/stops";
import { fleetDayRange } from "@/lib/time";
import { PLACES, zoneName } from "@/mock/geography";
import { createSeed } from "@/mock/seed";
import type { RootState } from "@/store";
import type { DriverTrack, JobAction, Page } from "@/types/api";
import type { Job, JobEvent, LogCategory, LogEntry, Stop } from "@/types/domain";
import type { ApiClient } from "./client";

/** Answers every API call from the Redux store, which holds the seeded demo data. */

const latency = <T>(value: T, ms = 120): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const has = (value: string | null | undefined, needle: string): boolean => !needle || (value ?? "").toLowerCase().includes(needle.toLowerCase());

const EVENT_CATEGORY: Record<JobEvent["type"], LogCategory> = {
  CREATED: "OPERATOR",
  PAUSED: "OPERATOR",
  RESUMED: "OPERATOR",
  CANCELLED: "OPERATOR",
  ASSIGNED: "OPERATOR",
  OFFERED: "SYSTEM",
  MISSED: "DRIVER",
  ACCEPTED: "DRIVER",
  STATUS: "DRIVER",
  NOSHOW: "DRIVER",
};

function searchPlaces(query: string): Stop[] {
  const q = query.toLowerCase().trim();
  const words = q.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  return PLACES.map((p) => {
    const label = p.label.toLowerCase();
    const hay = `${label} ${p.area.toLowerCase()} ${p.postcode.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) return null;
    const score = (label.startsWith(q) ? 100 : 0) + (label.startsWith(words[0] ?? "") ? 10 : 0) + words.filter((w) => label.includes(w)).length;
    return { stop: toStop(p), score };
  })
    .filter((x): x is { stop: Stop; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.stop);
}

function page<T>(items: T[], pageNo: number, pageSize: number): Page<T> {
  const start = (pageNo - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page: pageNo, pageSize };
}

export function createMockApi(getState: () => RootState): ApiClient {
  const jobs = (): Job[] => Object.values(getState().jobs.entities).filter((j): j is Job => Boolean(j));
  const drivers = () => Object.values(getState().fleet.drivers.entities).flatMap((d) => (d ? [d] : []));
  const callsignOf = (driverId: string | null) => (driverId ? (getState().fleet.drivers.entities[driverId]?.callsign ?? "") : "");

  return {
    bootstrap: () => latency(createSeed(Date.now()), 200),

    createJob(input) {
      const state = getState();
      const now = state.fleet.now || Date.now();
      const isDue = input.pickupAt - now <= input.leadMin * 60_000;
      const designated = input.designatedCallsign ? drivers().find((d) => d.callsign === input.designatedCallsign) : undefined;
      const { designatedCallsign: _ignored, ...rest } = input;
      const job: Job = {
        ...rest,
        id: makeId("job"),
        number: state.jobs.nextNumber,
        status: isDue ? "NEW" : "BOOKED",
        isAsap: input.pickupAt <= now + 60_000,
        driverId: null,
        designatedDriverId: designated?.id ?? null,
        offer: null,
        missedBy: [],
        flightNo: null,
        isRecurring: false,
        createdBy: APP.operator.name,
        createdAt: now,
        updatedAt: now,
        statusSince: now,
      };
      return latency(job);
    },

    jobAction: (_jobId: string, _action: JobAction) => latency(undefined, 60),

    lookupCustomer(phone) {
      const digits = digitsOnly(phone);
      const customer = getState().fleet.customers.find((c) => {
        const known = digitsOnly(c.phone);
        return known.endsWith(digits) || digits.endsWith(known);
      });
      return latency(customer ?? null, 80);
    },

    searchPlaces: (query) => latency(searchPlaces(query), 60),

    searchBookings(q) {
      const now = getState().fleet.now;
      const hhmm = (t: string) => (/^\d{4}$/.test(t) ? (Number(t.slice(0, 2)) * 60 + Number(t.slice(2))) * 60_000 : null);
      const from = (fleetDayRange(q.from, now)?.start ?? 0) + (hhmm(q.fromTime) ?? 0);
      const toDay = fleetDayRange(q.to, now);
      const toTime = hhmm(q.toTime);
      const to = toDay ? (toTime === null ? toDay.end : toDay.start + toTime + 59_999) : Number.MAX_SAFE_INTEGER;
      const matches = jobs()
        .filter(
          (j) =>
            j.pickupAt >= from &&
            j.pickupAt <= to &&
            (q.source === "ALL" || j.source === q.source) &&
            (q.siteId === "ALL" || j.siteId === q.siteId) &&
            (q.status === "ALL" || j.status === q.status) &&
            has(String(j.number), q.jobNumber) &&
            has(callsignOf(j.driverId), q.driver) &&
            has(`${j.pickup.label} ${j.pickup.area} ${j.pickup.postcode}`, q.address) &&
            has(j.dropoff ? `${j.dropoff.label} ${j.dropoff.area}` : "", q.destination) &&
            has(j.customerName, q.customerName) &&
            has(digitsOnly(j.phone), digitsOnly(q.customerPhone)) &&
            has(j.accountCode, q.account) &&
            has(`${j.instructions} ${j.operatorNotes} ${j.customerNotes}`, q.keyword),
        )
        .sort((a, b) => b.pickupAt - a.pickupAt);
      return latency(page(matches, q.page, q.pageSize));
    },

    searchDrivers(q) {
      const list = drivers()
        .filter(
          (d) =>
            has(d.callsign, q.ref) &&
            has(d.name, q.name) &&
            has(d.plate, q.plate) &&
            has(d.badge, q.badge) &&
            (q.version === "ALL" || d.appVersion === q.version) &&
            has(digitsOnly(d.phone), digitsOnly(q.phone)) &&
            (q.siteId === "ALL" || d.siteId === q.siteId) &&
            (q.active === "ALL" || (q.active === "ONLINE") === (d.status !== "AWAY")),
        )
        .sort((a, b) => (q.sort === "name" ? a.name.localeCompare(b.name) : Number(a.callsign) - Number(b.callsign)));
      return latency(list);
    },

    searchLogs(q) {
      const state = getState();
      const range = fleetDayRange(q.day, state.fleet.now);
      const jobById = state.jobs.entities;
      const fromEvents: LogEntry[] = state.jobs.events.map((e) => {
        const job = jobById[e.jobId];
        return {
          id: e.id,
          at: e.at,
          category: EVENT_CATEGORY[e.type],
          driver: callsignOf(job?.driverId ?? null),
          vehicle: "",
          zone: zoneName(job?.pickup.zoneId ?? null),
          jobNumber: String(job?.number ?? ""),
          operator: EVENT_CATEGORY[e.type] === "OPERATOR" ? APP.operator.name : "",
          action: e.type,
          text: e.text,
        };
      });
      const created: LogEntry[] = jobs().map((j) => ({
        id: `created-${j.id}`,
        at: j.createdAt,
        category: "OPERATOR",
        driver: "",
        vehicle: "",
        zone: zoneName(j.pickup.zoneId),
        jobNumber: String(j.number),
        operator: j.createdBy,
        action: "CREATED",
        text: `Booking created for ${j.customerName}, ${j.pickup.label}`,
      }));
      const list = [...fromEvents, ...created]
        .filter(
          (l) =>
            (!range || (l.at >= range.start && l.at <= range.end)) &&
            q.categories.includes(l.category) &&
            has(l.driver, q.driver) &&
            has(l.vehicle, q.vehicle) &&
            has(l.zone, q.zone) &&
            has(l.jobNumber, q.jobNumber) &&
            has(l.operator, q.operator) &&
            has(l.action, q.action),
        )
        .sort((a, b) => (q.oldestFirst ? a.at - b.at : b.at - a.at))
        .slice(0, 500);
      return latency(list);
    },

    sendStaffMessage: (to, body) => latency({ id: makeId("sm"), from: APP.operator.name, to, body, at: Date.now() }),
    sendBroadcast: () => latency(undefined),
    takeChat: () => latency(undefined, 40),
    closeChat: () => latency(undefined, 40),
    takeCall: () => latency(undefined, 40),
    deleteAlert: () => latency(undefined, 40),
    deleteFlight: () => latency(undefined, 40),
    clearZoneFlags: () => latency(undefined, 40),

    driverTracks({ from, to, centre, radiusM }) {
      const minutes = Math.max(1, Math.round((to - from) / 60_000));
      const tracks: DriverTrack[] = drivers()
        .filter((d) => distanceM(centre, d) <= radiusM && (DISPATCHABLE.has(d.status) || d.status !== "AWAY"))
        .slice(0, 12)
        .map((d) => {
          const rand = createRandom(Number(d.callsign) + from);
          let point = { lat: d.lat, lng: d.lng };
          const points = Array.from({ length: Math.min(60, minutes * 4) }, (_, i) => {
            point = jitter(point, 250, rand);
            return { ...point, at: from + i * 15_000 };
          });
          return { callsign: d.callsign, points };
        });
      return latency(tracks, 300);
    },
  };
}
