import { APP, SITES, VEHICLES } from "@/config/app";
import { quoteFares, routeMiles } from "@/lib/fare";
import { jitter } from "@/lib/geo";
import { createRandom, intBetween, pick } from "@/lib/random";
import { toStop } from "@/lib/stops";
import type { Snapshot } from "@/types/api";
import type {
  Alert,
  BookingSource,
  CallRequest,
  Customer,
  Driver,
  DriverChat,
  DriverStatus,
  Flight,
  Job,
  JobStatus,
  Millis,
  PaymentType,
  StaffMessage,
  Stop,
  VehicleType,
} from "@/types/domain";
import { PLACES, ZONES } from "./geography";

/**
 * Invented demo data only. No real passengers, drivers or operators.
 * Phone numbers sit in Ofcom's 07700 900xxx range, reserved for drama.
 */
const FIRST = ["Amelia", "Oliver", "Isla", "George", "Ava", "Harry", "Mia", "Jack", "Freya", "Noah", "Grace", "Leo", "Evie", "Arthur", "Poppy", "Oscar", "Lily", "Alfie", "Rosie", "Theo"];
const LAST = ["Hartley", "Penrose", "Ashdown", "Calloway", "Brooke", "Fenwick", "Holloway", "Marsh", "Kendrick", "Lowell", "Stanway", "Thorne", "Wakefield", "Yardley", "Ellery", "Garner"];
const DRIVER_FIRST = ["Sam", "Ali", "Dan", "Raj", "Tom", "Kev", "Mo", "Lee", "Pete", "Imran", "Gary", "Nadeem", "Chris", "Wes"];
const OPERATOR_NAMES = ["Demo Operator", "Sara Lind", "Tom Reeve", "Nadia Brook", "Owen Hale", "Priya Shah", "Ben Ward", "Lucy Moss"];
const INSTRUCTIONS = ["", "", "", "RING ON ARRIVAL", "WAIT OUTSIDE MAIN ENTRANCE", "CHILD SEAT NEEDED", "1 CASE AND 2 HAND LUGGAGE", "WHEELCHAIR, FOLDS INTO BOOT"];

type InboxSeed = Snapshot["inbox"];

const SEED = 20261023;
const MIN = 60_000;

export const fakePhone = (n: number): string => `07700 900${String(n % 1000).padStart(3, "0")}`;

function tariffFare(pickup: Stop, dropoff: Stop | null, vehicle: VehicleType): number | null {
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
      phone: fakePhone(100 + i * 7),
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
  return Array.from({ length: 34 }, (_, i) => {
    const zone = pick(i < 24 ? localZones : ZONES, rand);
    const vehicle = pick(vehicles, rand);
    const roll = rand();
    const status: DriverStatus = roll < 0.1 ? "AWAY" : roll < 0.45 ? "PARKED" : "AVAILABLE";
    return {
      id: `d${i + 1}`,
      callsign: String(120 + i * 23),
      name: `${pick(DRIVER_FIRST, rand)} ${pick(LAST, rand)}`,
      phone: fakePhone(500 + i * 11),
      plate: `GX${intBetween(10, 74, rand)} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(66 + ((i * 3) % 24))}C`,
      badge: `PH${intBetween(1000, 9999, rand)}`,
      appVersion: pick(["6.4.1", "6.4.0", "6.3.8"], rand),
      siteId: pick(SITES, rand).id,
      vehicle,
      seats: VEHICLES[vehicle].seats,
      status,
      target: null,
      currentJobId: null,
      zoneId: zone.id,
      updatedAt: now,
      statusSince: now - intBetween(1, 290, rand) * MIN,
      ...jitter(zone, zone.radiusM * 0.8, rand),
    };
  });
}

interface JobDraft {
  status: JobStatus;
  pickupAt: Millis;
  flight: boolean;
}

/** A believable evening: a few live jobs, a full pre-booked window, work done earlier and some exceptions. */
function plannedJobs(now: Millis, rand: () => number): JobDraft[] {
  const plan: JobDraft[] = [];
  const add = (count: number, status: JobStatus, from: number, to: number, flight = false): void => {
    for (let i = 0; i < count; i += 1) plan.push({ status, pickupAt: now + intBetween(from, to, rand) * MIN, flight });
  };
  add(1, "PAUSED", -8, -2, true);
  add(1, "NEW", -2, 2);
  add(1, "PAUSED", 0, 4);
  add(1, "BIDDING", -3, 0);
  add(48, "BOOKED", 20, 240);
  add(2, "BOOKED", 60, 200, true);
  add(16, "BOOKED", 250, 1200);
  add(54, "COMPLETED", -480, -30);
  add(5, "CANCELLED", -300, -20);
  add(3, "NOSHOW", -120, -60);
  return plan;
}

function makeJobs(now: Millis, rand: () => number, customers: Customer[], drivers: Driver[]): Job[] {
  const sources: BookingSource[] = ["PHONE", "PHONE", "PHONE", "APP", "APP", "WEB"];
  const gatwick = PLACES.filter((p) => p.zoneId === "gw");
  return plannedJobs(now, rand)
    .sort((a, b) => a.pickupAt - b.pickupAt)
    .map((draft, i): Job => {
      const customer = pick(customers, rand);
      const pickupPlace = draft.flight ? pick(gatwick, rand) : pick(PLACES, rand);
      let dropPlace = pick(PLACES, rand);
      if (dropPlace.id === pickupPlace.id) dropPlace = pick(PLACES, rand);
      const vehicle: VehicleType = rand() > 0.82 ? pick(["ESTATE", "MPV", "EXEC"] as const, rand) : "SALOON";
      const source = pick(sources, rand);
      const payment: PaymentType = customer.accountCode ? "ACCOUNT" : source === "APP" ? "CARD" : "CASH";
      const pickup = toStop(pickupPlace);
      const dropoff = toStop(dropPlace);
      const { status } = draft;
      return {
        id: `j${i + 1}`,
        number: 69749000 + i * 17,
        status,
        pickupAt: draft.pickupAt,
        isAsap: status === "NEW" || status === "BIDDING",
        leadMin: APP.defaultLeadMin,
        priority: intBetween(1, 9, rand),
        passengers: intBetween(1, VEHICLES[vehicle].seats, rand),
        taxis: 1,
        vehicle,
        extras: "",
        pickup,
        vias: [],
        dropoff,
        customerName: customer.name.toUpperCase(),
        phone: customer.phone,
        altPhone: "",
        email: customer.email,
        instructions: pick(INSTRUCTIONS, rand),
        customerNotes: "",
        operatorNotes: rand() > 0.9 ? "Regular, prefers saloon" : "",
        excludeDrivers: [],
        accountCode: customer.accountCode,
        payment,
        source,
        siteId: pick(SITES, rand).id,
        fare: tariffFare(pickup, dropoff, vehicle),
        fareOverridden: false,
        driverId: status === "COMPLETED" || status === "NOSHOW" ? pick(drivers, rand).id : null,
        designatedDriverId: null,
        offer: null,
        missedBy: status === "BIDDING" ? ["143", "212", "350"] : [],
        flightNo: draft.flight ? `EZY${intBetween(8100, 8999, rand)}` : null,
        isRecurring: rand() > 0.93,
        options: { sendSms: true, sendRingback: rand() > 0.4, autoComplete: false },
        createdBy: pick(OPERATOR_NAMES, rand),
        createdAt: draft.pickupAt - intBetween(30, 600, rand) * MIN,
        updatedAt: now,
        statusSince: now - intBetween(1, 8, rand) * MIN,
      };
    });
}

function makeInbox(now: Millis, rand: () => number, drivers: Driver[], jobs: Job[]): InboxSeed {
  const callsign = () => pick(drivers, rand).callsign;
  const operators = OPERATOR_NAMES.map((name, i) => ({ id: `op${i + 1}`, name, online: rand() > 0.25, bookingsLastHour: Math.max(0, 6 - i + intBetween(-1, 1, rand)) }));
  const staffMessages: StaffMessage[] = [
    { id: "sm1", from: "Sara Lind", to: "All operators", body: "Driver 235 found a phone. If anyone calls about it, arrange collection please.", at: now - 34 * MIN },
    { id: "sm2", from: "Tom Reeve", to: "All operators", body: "Account customer asked for a payment link, number on job 69749204.", at: now - 61 * MIN },
    { id: "sm3", from: "Nadia Brook", to: "All operators", body: "Please call 662 when free.", at: now - 72 * MIN },
  ];
  const driverChats: DriverChat[] = [
    ["The job I did, it was paid", "Driver created", 26],
    ["PLEASE SEND ME MY ALLOCATED JOB", "Driver created", 41],
    ["Traffic on the A22, running 5 min late", "Driver created", 48],
  ].map(([response, original, ago], i) => ({
    id: `dc${i + 1}`,
    callsign: callsign(),
    response: String(response),
    original: String(original),
    messageAt: now - Number(ago) * MIN,
    responseAt: now - Number(ago) * MIN,
    takenBy: null,
  }));
  const booked = jobs.filter((j) => j.status === "BOOKED");
  const callQueue: CallRequest[] = Array.from({ length: 9 }, (_, i) => {
    const job = rand() > 0.5 ? booked[i] : undefined;
    return {
      id: `cq${i + 1}`,
      position: i < 2 ? 1 : Math.ceil(i / 1.5),
      callsign: callsign(),
      phone: fakePhone(700 + i * 13),
      name: `${pick(DRIVER_FIRST, rand).toUpperCase()} ${pick(LAST, rand).toUpperCase()}`,
      booking: job ? `${job.customerName} ${job.pickup.label.toUpperCase()}` : null,
      at: now - intBetween(2, 400, rand) * MIN,
    };
  });
  const appJobs = jobs.filter((j) => j.source === "APP").slice(0, 4);
  const alerts: Alert[] = [
    ...appJobs.map((j, i) => ({
      id: `al${i + 1}`,
      at: now - (i * 2 + 1) * MIN,
      kind: "APP_BOOKING" as const,
      title: "New APP Booking",
      message: `CUST: ${j.customerName}\nPICKUP: ${j.pickup.label.toUpperCase()}, ${j.pickup.area.toUpperCase()}, ${j.pickup.postcode}`,
      jobId: j.id,
      callsign: null,
    })),
    { id: "al9", at: now - 3 * MIN, kind: "DRIVER_LOGOUT", title: "DRIVER LOGOUT", message: `${callsign()} has logged out`, jobId: null, callsign: null },
  ];
  const flights: Flight[] = [
    { id: "fl1", airline: "easyJet", number: "U2816", from: "Edinburgh Airport", to: "London Gatwick Airport", scheduled: now + 25 * MIN, arrival: now + 25 * MIN, status: "Scheduled", bookings: 0 },
    { id: "fl2", airline: "easyJet", number: "EZY8352", from: "Geneva Airport", to: "London Gatwick Airport", scheduled: now - 10 * MIN, arrival: now + 12 * MIN, status: "Delayed", bookings: 1 },
  ];
  return { operators, staffMessages, driverChats, callQueue, alerts: alerts.sort((a, b) => b.at - a.at), flights };
}

export function createSeed(now: Millis): Snapshot {
  const rand = createRandom(SEED);
  const customers = makeCustomers(rand);
  const drivers = makeDrivers(rand, now);
  const jobs = makeJobs(now, rand, customers, drivers);

  // One live job waits for a requested driver, the case operators handle with Driver ID.
  const pausedSecond = jobs.filter((j) => j.status === "PAUSED")[1];
  const designated = drivers.find((d) => d.status === "AVAILABLE");
  if (pausedSecond && designated) pausedSecond.designatedDriverId = designated.id;

  return { customers, drivers, jobs, nextJobNumber: 69749000 + jobs.length * 17, inbox: makeInbox(now, rand, drivers, jobs) };
}
