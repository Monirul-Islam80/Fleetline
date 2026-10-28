import { APP, SIM, SITES } from "@/config/app";
import { DISPATCHABLE } from "@/config/status";
import { distanceM, jitter, nearest, stepTowards } from "@/lib/geo";
import { intBetween, makeId, pick } from "@/lib/random";
import { PLACES } from "@/mock/geography";
import { toStop } from "@/lib/stops";
import type { Alert, Driver, Job, JobEvent, LatLng, Millis, Zone } from "@/types/domain";
import { realtimeReceived } from "@/store/actions";
import type { AppThunk } from "@/store";
import { rankDrivers, selectAllDrivers, selectAllJobs } from "@/store/selectors";
import { jobAdded } from "@/store/slices/jobsSlice";
import { makeEvent } from "@/store/thunks/events";

/**
 * Mock backend: stands in for the server-side dispatch engine and the realtime channel.
 * Once a second it reads the store and emits one `realtimeReceived` batch, the same message the
 * live socket will send. Delete this file when the real backend is connected.
 */

/** Collects changes during a tick and lets later steps read the already-changed values. */
class TickDraft {
  readonly jobChanges = new Map<string, Partial<Job>>();
  readonly driverChanges = new Map<string, Partial<Driver>>();
  readonly events: JobEvent[] = [];
  readonly alerts: Alert[] = [];
  private readonly jobs: Map<string, Job>;
  private readonly drivers: Map<string, Driver>;

  constructor(jobs: Job[], drivers: Driver[], readonly now: Millis) {
    this.jobs = new Map(jobs.map((j) => [j.id, j]));
    this.drivers = new Map(drivers.map((d) => [d.id, d]));
  }

  job(id: string): Job | undefined {
    const base = this.jobs.get(id);
    return base ? { ...base, ...this.jobChanges.get(id) } : undefined;
  }

  driver(id: string): Driver | undefined {
    const base = this.drivers.get(id);
    return base ? { ...base, ...this.driverChanges.get(id) } : undefined;
  }

  allDrivers(): Driver[] {
    return [...this.drivers.keys()].flatMap((id) => {
      const d = this.driver(id);
      return d ? [d] : [];
    });
  }

  patchJob(id: string, changes: Partial<Job>, event?: string, type: JobEvent["type"] = "STATUS"): void {
    const merged = { ...this.jobChanges.get(id), ...changes, updatedAt: this.now };
    if (changes.status) merged.statusSince = this.now;
    this.jobChanges.set(id, merged);
    if (event) this.events.push(makeEvent(id, type, event, this.now));
  }

  patchDriver(id: string, changes: Partial<Driver>): void {
    const merged = { ...this.driverChanges.get(id), ...changes, updatedAt: this.now };
    if (changes.status) merged.statusSince = this.now;
    this.driverChanges.set(id, merged);
  }
}

function makeAlert(kind: Alert["kind"], title: string, message: string, at: Millis, jobId: string | null, callsign: string | null = null): Alert {
  return { id: makeId("al"), kind, title, message, at, jobId, callsign };
}

const stepMetres = (factor = 1): number => SIM.carSpeedMps * (SIM.tickMs / 1000) * SIM.speedFactor * factor;

function releasePrebookings(draft: TickDraft, jobs: Job[]): void {
  for (const job of jobs) {
    if (job.status === "BOOKED" && job.pickupAt - job.leadMin * 60_000 <= draft.now) {
      draft.patchJob(job.id, { status: "NEW" }, "Released to dispatch");
    }
  }
}

function offerJob(draft: TickDraft, job: Job, driver: Driver): void {
  const accepts = job.designatedDriverId === driver.id || Math.random() < SIM.acceptProbability;
  draft.patchJob(
    job.id,
    {
      offer: {
        driverId: driver.id,
        offeredAt: draft.now,
        expiresAt: draft.now + SIM.offerTimeoutMs,
        decideAt: accepts ? draft.now + intBetween(2, 8, Math.random) * 1000 : null,
      },
    },
    `Offered to ${driver.callsign}`,
    "OFFERED",
  );
  draft.patchDriver(driver.id, { status: "OFFERED" });
}

function startTrip(draft: TickDraft, job: Job, driver: Driver, how: string): void {
  draft.patchJob(job.id, { status: "ENROUTE", driverId: driver.id, offer: null }, `${how} by ${driver.callsign}`, "ACCEPTED");
  draft.patchDriver(driver.id, { status: "ENROUTE", currentJobId: job.id, target: { lat: job.pickup.lat, lng: job.pickup.lng } });
}

function runOffers(draft: TickDraft, jobs: Job[]): void {
  const reserved = new Set<string>();
  for (const original of jobs) {
    const job = draft.job(original.id);
    if (!job || job.status !== "NEW") continue;
    const offer = job.offer;

    if (offer) {
      reserved.add(offer.driverId);
      const driver = draft.driver(offer.driverId);
      if (!driver) continue;
      if (offer.decideAt !== null && draft.now >= offer.decideAt) {
        startTrip(draft, job, driver, "Accepted");
      } else if (draft.now >= offer.expiresAt) {
        const missedBy = [...job.missedBy, driver.callsign];
        draft.patchJob(job.id, { offer: null, missedBy }, `${driver.callsign} missed the offer`, "MISSED");
        draft.patchDriver(driver.id, { status: "AVAILABLE" });
        if (missedBy.length >= SIM.maxMissesBeforeBidding && !job.designatedDriverId) {
          draft.patchJob(job.id, { status: "BIDDING" }, `Open to bid after ${missedBy.length} missed offers`);
        }
      }
      continue;
    }

    const free = draft.allDrivers().filter((d) => !reserved.has(d.id));
    let candidate: Driver | undefined;
    if (job.designatedDriverId) {
      const d = free.find((x) => x.id === job.designatedDriverId);
      candidate = d && DISPATCHABLE.has(d.status) ? d : undefined;
    } else {
      candidate = rankDrivers(job.pickup, free, job.passengers, job.missedBy)[0]?.driver;
    }
    if (candidate) {
      reserved.add(candidate.id);
      offerJob(draft, job, candidate);
    }
  }
}

function runBidding(draft: TickDraft, jobs: Job[]): void {
  for (const original of jobs) {
    const job = draft.job(original.id);
    if (!job || job.status !== "BIDDING" || Math.random() > 0.06) continue;
    const winner = rankDrivers(job.pickup, draft.allDrivers(), job.passengers)[0]?.driver;
    if (winner) startTrip(draft, job, winner, "Bid won");
  }
}

const zoneFor = (point: LatLng, zones: readonly Zone[]): string | null => nearest(point, zones)?.item.id ?? null;

function moveDrivers(draft: TickDraft, zones: readonly Zone[]): void {
  for (const base of draft.allDrivers()) {
    const driver = draft.driver(base.id);
    if (!driver) continue;
    const job = driver.currentJobId ? draft.job(driver.currentJobId) : undefined;
    const move = (target: LatLng, factor = 1): LatLng => {
      const next = stepTowards(driver, target, stepMetres(factor));
      draft.patchDriver(driver.id, { lat: next.lat, lng: next.lng });
      return next;
    };

    switch (driver.status) {
      case "ENROUTE": {
        if (!job) break;
        const pos = move(job.pickup);
        if (distanceM(pos, job.pickup) <= SIM.arrivedRadiusM) {
          draft.patchDriver(driver.id, { status: "ARRIVED", target: null });
          draft.patchJob(job.id, { status: "ARRIVED" }, "Arrived at pickup");
        }
        break;
      }
      case "ARRIVED": {
        if (!job || draft.now - driver.statusSince < SIM.waitAtPickupMs) break;
        if (Math.random() < SIM.noShowProbability) {
          draft.patchJob(job.id, { status: "NOSHOW" }, "Passenger did not show", "NOSHOW");
          draft.alerts.push(makeAlert("NOSHOW", `NOSHOW ${driver.callsign} (${job.customerName})`, `${job.pickup.label.toUpperCase()}, ${job.pickup.area.toUpperCase()}`, draft.now, job.id));
          draft.patchDriver(driver.id, { status: "AVAILABLE", currentJobId: null });
          break;
        }
        const target = job.dropoff ?? jitter(job.pickup, 3000, Math.random);
        draft.patchJob(job.id, { status: "POB" }, "Passenger on board");
        draft.patchDriver(driver.id, { status: "POB", target: { lat: target.lat, lng: target.lng } });
        break;
      }
      case "POB":
      case "DROPPING": {
        if (!job || !driver.target) break;
        const pos = move(driver.target);
        const left = distanceM(pos, driver.target);
        if (left <= SIM.arrivedRadiusM) {
          draft.patchJob(job.id, { status: "COMPLETED" }, "Completed");
          draft.patchDriver(driver.id, { status: "AVAILABLE", currentJobId: null, target: null, zoneId: zoneFor(pos, zones) });
        } else if (driver.status === "POB" && left <= SIM.droppingRadiusM) {
          draft.patchJob(job.id, { status: "DROPPINGOFF" }, "Approaching drop-off");
          draft.patchDriver(driver.id, { status: "DROPPING" });
        }
        break;
      }
      case "AVAILABLE": {
        if (driver.target) {
          const pos = move(driver.target, 0.5);
          if (distanceM(pos, driver.target) < 20) draft.patchDriver(driver.id, { target: null, zoneId: zoneFor(pos, zones) });
        } else if (Math.random() < 0.03) {
          draft.patchDriver(driver.id, { status: "PARKED", zoneId: zoneFor(driver, zones) });
        } else if (Math.random() < 0.002) {
          draft.patchDriver(driver.id, { status: "AWAY" });
          draft.alerts.push(makeAlert("DRIVER_LOGOUT", "DRIVER LOGOUT", `${driver.callsign} ${driver.name.toUpperCase()} has logged out`, draft.now, null, driver.callsign));
        } else if (Math.random() < 0.12) {
          const zone = zones.find((z) => z.id === driver.zoneId) ?? pick(zones, Math.random);
          draft.patchDriver(driver.id, { target: jitter(zone, zone.radiusM * 0.7, Math.random) });
        }
        break;
      }
      case "PARKED":
        if (Math.random() < 0.008) draft.patchDriver(driver.id, { status: "AVAILABLE" });
        break;
      case "AWAY":
        if (Math.random() < 0.004) draft.patchDriver(driver.id, { status: "AVAILABLE" });
        break;
      case "OFFERED":
        break;
    }
  }
}

function driftZones(zones: readonly Zone[]): Zone[] | undefined {
  if (Math.random() > 0.03) return undefined;
  const target = pick(zones, Math.random);
  return zones.map((z) => (z.id === target.id ? { ...z, surge: !z.surge } : z));
}

export const engineTick = (): AppThunk => (dispatch, getState) => {
  const state = getState();
  if (!state.fleet.ready) return;
  const now = Date.now();
  const jobs = selectAllJobs(state);
  const draft = new TickDraft(jobs, selectAllDrivers(state), now);

  releasePrebookings(draft, jobs);
  runOffers(draft, jobs);
  runBidding(draft, jobs);
  moveDrivers(draft, state.fleet.zones);

  dispatch(
    realtimeReceived({
      now,
      jobs: [...draft.jobChanges].map(([id, changes]) => ({ id, changes })),
      drivers: [...draft.driverChanges].map(([id, changes]) => ({ id, changes })),
      events: draft.events.reverse(),
      alerts: draft.alerts,
      zones: driftZones(state.fleet.zones),
    }),
  );
};


const DEMO_NAMES = ["RUBY ASHDOWN", "FINN CALLOWAY", "HATTIE MARSH", "JOEL PENROSE", "NINA FENWICK", "OWEN HARTLEY"];

/** Adds an app booking now and then, so the board keeps moving during a demo. */
export const createAppBooking = (): AppThunk => (dispatch, getState) => {
  const state = getState();
  const now = state.fleet.now || Date.now();
  const pickupPlace = pick(PLACES, Math.random);
  let dropPlace = pick(PLACES, Math.random);
  if (dropPlace.id === pickupPlace.id) dropPlace = pick(PLACES, Math.random);
  const job: Job = {
    id: makeId("job"),
    number: state.jobs.nextNumber,
    status: "NEW",
    pickupAt: now,
    isAsap: true,
    leadMin: APP.defaultLeadMin,
    priority: 5,
    passengers: intBetween(1, 3, Math.random),
    taxis: 1,
    vehicle: "SALOON",
    extras: "",
    pickup: toStop(pickupPlace),
    vias: [],
    dropoff: toStop(dropPlace),
    customerName: pick(DEMO_NAMES, Math.random),
    phone: `07700 900${intBetween(500, 999, Math.random)}`,
    altPhone: "",
    email: null,
    instructions: "",
    customerNotes: "",
    operatorNotes: "",
    excludeDrivers: [],
    accountCode: null,
    payment: "CARD",
    source: "APP",
    siteId: pick(SITES, Math.random).id,
    fare: Math.round((6 + Math.random() * 14) * 10) / 10,
    fareOverridden: false,
    driverId: null,
    designatedDriverId: null,
    offer: null,
    missedBy: [],
    flightNo: null,
    isRecurring: false,
    options: { sendSms: true, sendRingback: true, autoComplete: false },
    createdBy: "Passenger app",
    createdAt: now,
    updatedAt: now,
    statusSince: now,
  };
  dispatch(jobAdded({ job, event: makeEvent(job.id, "CREATED", "Booked in the passenger app", now) }));
};
