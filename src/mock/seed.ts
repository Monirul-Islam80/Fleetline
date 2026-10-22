import { APP, VEHICLES } from "@/config/app";
import { quoteFares, routeMiles } from "@/lib/fare";
import { jitter } from "@/lib/geo";
import { createRandom, intBetween, pick } from "@/lib/random";
import { toStop } from "@/lib/stops";
import type {
  BookingSource,
  Customer,
  Driver,
  DriverStatus,
  Job,
  JobStatus,
  Millis,
  PaymentType,
  Stop,
  VehicleType,
} from "@/types/domain";
import { PLACES, ZONES } from "./geography";

/** Invented names only. Phone numbers sit in Ofcom's 07700 900xxx range, reserved for fiction. */
const FIRST = ["Amelia", "Oliver", "Isla", "George", "Ava", "Harry", "Mia", "Jack", "Freya", "Noah", "Grace", "Leo", "Evie", "Arthur", "Poppy", "Oscar", "Lily", "Alfie", "Rosie", "Theo"];
const LAST = ["Hartley", "Penrose", "Ashdown", "Calloway", "Brooke", "Fenwick", "Holloway", "Marsh", "Kendrick", "Lowell", "Stanway", "Thorne", "Wakefield", "Yardley", "Ellery", "Garner"];
const DRIVER_FIRST = ["Sam", "Ali", "Dan", "Raj", "Tom", "Kev", "Mo", "Lee", "Pete", "Imran", "Gary", "Nadeem", "Chris", "Wes"];
const INSTRUCTIONS = ["", "", "", "Ring on arrival", "Wait outside main entrance", "Child seat needed", "Two large suitcases", "Wheelchair user, folds into boot", "Collect from side door"];

export interface SeedData {
  customers: Customer[];
  drivers: Driver[];
  jobs: Job[];
  nextJobNumber: number;
}

const SEED = 20261023;

function farePlaces(pickup: Stop, dropoff: Stop | null, vehicle: VehicleType): number | null {
  if (!dropoff) return null;
  const quotes = quoteFares(routeMiles([pickup, dropoff]));
  const index = vehicle === "EXEC" ? 2 : vehicle === "MPV" || vehicle === "ESTATE" ? 1 : 0;
  return quotes[index]?.price ?? null;
}

function makeCustomers(rand: () => number): Customer[] {
  return Array.from({ length: 40 }, (_, i) => {
    const first = pick(FIRST, rand);
    const last = pick(LAST, rand);
    const recent = Array.from({ length: intBetween(2, 5, rand) }, () => pick(PLACES, rand).id);
    return {
      id: `c${i + 1}`,
      name: `${first} ${last}`,
      phone: `07700 900${String(100 + i * 7).padStart(3, "0")}`,
      email: rand() > 0.5 ? `${first}.${last}@example.com`.toLowerCase() : null,
      tripCount: intBetween(1, 60, rand),
      recentPlaceIds: Array.from(new Set(recent)),
      accountCode: rand() > 0.85 ? pick(["ACME-01", "QVH-STAFF", "GTW-CREW"], rand) : null,
    };
  });
}

function makeDrivers(rand: () => number, now: Millis): Driver[] {
  const vehicles: VehicleType[] = ["SALOON", "SALOON", "SALOON", "ESTATE", "MPV", "EXEC", "WAV"];
  const localZones = ZONES.filter((z) => z.tag === "local");
  return Array.from({ length: 30 }, (_, i) => {
    const zone = pick(i < 22 ? localZones : ZONES, rand);
    const pos = jitter(zone, zone.radiusM * 0.8, rand);
    const vehicle = pick(vehicles, rand);
    const roll = rand();
    const status: DriverStatus = roll < 0.12 ? "AWAY" : roll < 0.35 ? "PARKED" : "AVAILABLE";
    return {
      id: `d${i + 1}`,
      callsign: String(120 + i * 23),
      name: `${pick(DRIVER_FIRST, rand)} ${pick(LAST, rand).charAt(0)}.`,
      vehicle,
      seats: VEHICLES[vehicle].seats,
      status,
      target: null,
      currentJobId: null,
      zoneId: zone.id,
      updatedAt: now,
      statusSince: now - intBetween(1, 40, rand) * 60_000,
      ...pos,
    };
  });
}

interface JobDraft {
  status: JobStatus;
  pickupAt: Millis;
  flight?: boolean;
}

/**
 * Builds a believable mid-afternoon picture: a handful of live jobs, a full pre-booked
 * window, completed work earlier in the day and a few exceptions.
 */
function plannedJobs(now: Millis, rand: () => number): JobDraft[] {
  const min = 60_000;
  const plan: JobDraft[] = [];
  const add = (count: number, status: JobStatus, from: number, to: number, flight = false): void => {
    for (let i = 0; i < count; i += 1) {
      plan.push({ status, pickupAt: now + intBetween(from, to, rand) * min, flight });
    }
  };
  add(2, "NEW", -4, 2);
  add(1, "PAUSED", -6, 0);
  add(1, "BIDDING", -3, 0);
  add(66, "BOOKED", 20, 240);
  add(2, "BOOKED", 60, 200, true);
  add(24, "BOOKED", 250, 1200);
  add(68, "COMPLETED", -480, -30);
  add(4, "CANCELLED", -300, -20);
  add(1, "NOSHOW", -120, -60);
  return plan;
}

export function createSeed(now: Millis): SeedData {
  const rand = createRandom(SEED);
  const customers = makeCustomers(rand);
  const drivers = makeDrivers(rand, now);
  const sources: BookingSource[] = ["PHONE", "PHONE", "PHONE", "APP", "APP", "WEB"];
  const gatwick = PLACES.filter((p) => p.zoneId === "gw");

  const jobs: Job[] = plannedJobs(now, rand)
    .sort((a, b) => a.pickupAt - b.pickupAt)
    .map((draft, i) => {
      const customer = pick(customers, rand);
      const pickupPlace = draft.flight ? pick(gatwick, rand) : pick(PLACES, rand);
      let dropPlace = pick(PLACES, rand);
      if (dropPlace.id === pickupPlace.id) dropPlace = pick(PLACES, rand);
      const vehicle: VehicleType = rand() > 0.82 ? pick(["ESTATE", "MPV", "EXEC"], rand) : "SALOON";
      const source = pick(sources, rand);
      const payment: PaymentType = customer.accountCode ? "ACCOUNT" : source === "APP" ? "CARD" : "CASH";
      const pickup = toStop(pickupPlace);
      const dropoff = toStop(dropPlace);
      const status = draft.status;
      return {
        id: `j${i + 1}`,
        number: 40120 + i,
        status,
        pickupAt: draft.pickupAt,
        isAsap: status === "NEW" || status === "BIDDING",
        leadMin: APP.defaultLeadMin,
        priority: intBetween(1, 9, rand),
        passengers: intBetween(1, VEHICLES[vehicle].seats, rand),
        taxis: 1,
        vehicle,
        pickup,
        vias: [],
        dropoff,
        customerName: customer.name,
        phone: customer.phone,
        email: customer.email,
        instructions: pick(INSTRUCTIONS, rand),
        accountCode: customer.accountCode,
        payment,
        source,
        fare: farePlaces(pickup, dropoff, vehicle),
        fareOverridden: false,
        driverId: status === "COMPLETED" || status === "NOSHOW" ? pick(drivers, rand).id : null,
        designatedDriverId: null,
        offer: null,
        missedBy: status === "BIDDING" ? ["143", "212", "350"] : [],
        flightNo: draft.flight ? `EZY${intBetween(8100, 8999, rand)}` : null,
        isRecurring: rand() > 0.93,
        createdAt: draft.pickupAt - intBetween(30, 600, rand) * 60_000,
        updatedAt: now,
        statusSince: now - intBetween(1, 8, rand) * 60_000,
      } satisfies Job;
    });

  // One live job is pre-assigned to a named driver, the case operators handle by Driver ID.
  const firstNew = jobs.find((j) => j.status === "NEW");
  const designated = drivers.find((d) => d.status === "AVAILABLE");
  if (firstNew && designated) firstNew.designatedDriverId = designated.id;

  return { customers, drivers, jobs, nextJobNumber: 40120 + jobs.length };
}
