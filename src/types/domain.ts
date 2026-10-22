/** Core domain types. Shapes mirror the planned Postgres schema so the mock layer can be swapped for the API later. */

export type ID = string;

/** Epoch milliseconds. Stored as numbers so Redux state stays serializable. */
export type Millis = number;

export interface LatLng {
  lat: number;
  lng: number;
}

export type JobStatus =
  | "BOOKED"
  | "NEW"
  | "PAUSED"
  | "BIDDING"
  | "ENROUTE"
  | "ARRIVED"
  | "POB"
  | "DROPPINGOFF"
  | "COMPLETED"
  | "NOSHOW"
  | "CANCELLED";

export type DriverStatus =
  | "AVAILABLE"
  | "PARKED"
  | "OFFERED"
  | "ENROUTE"
  | "ARRIVED"
  | "POB"
  | "DROPPING"
  | "AWAY";

export type VehicleType = "SALOON" | "ESTATE" | "MPV" | "EXEC" | "WAV";

export type BookingSource = "PHONE" | "APP" | "WEB";

export type PaymentType = "CASH" | "CARD" | "ACCOUNT";

export interface Place extends LatLng {
  id: ID;
  label: string;
  area: string;
  postcode: string;
  zoneId: ID;
}

/** A stop on a job. Snapshot of the place at booking time so later edits to places never rewrite history. */
export interface Stop extends LatLng {
  label: string;
  area: string;
  postcode: string;
  zoneId: ID | null;
}

export interface Zone extends LatLng {
  id: ID;
  name: string;
  radiusM: number;
  tag: "local" | "airport" | "outer";
  surge: boolean;
  fullyBooked: boolean;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string | null;
  tripCount: number;
  recentPlaceIds: ID[];
  accountCode: string | null;
}

export interface Driver extends LatLng {
  id: ID;
  callsign: string;
  name: string;
  vehicle: VehicleType;
  seats: number;
  status: DriverStatus;
  /** Where the simulator is steering the car. */
  target: LatLng | null;
  currentJobId: ID | null;
  zoneId: ID | null;
  updatedAt: Millis;
  statusSince: Millis;
}

export interface Offer {
  driverId: ID;
  offeredAt: Millis;
  expiresAt: Millis;
  /** Simulator only: when the bot driver will answer, if it answers at all. */
  decideAt: Millis | null;
}

export interface Job {
  id: ID;
  number: number;
  status: JobStatus;
  pickupAt: Millis;
  isAsap: boolean;
  leadMin: number;
  priority: number;
  passengers: number;
  taxis: number;
  vehicle: VehicleType;
  pickup: Stop;
  vias: Stop[];
  dropoff: Stop | null;
  customerName: string;
  phone: string;
  email: string | null;
  instructions: string;
  accountCode: string | null;
  payment: PaymentType;
  source: BookingSource;
  fare: number | null;
  fareOverridden: boolean;
  driverId: ID | null;
  designatedDriverId: ID | null;
  offer: Offer | null;
  missedBy: string[];
  flightNo: string | null;
  isRecurring: boolean;
  createdAt: Millis;
  updatedAt: Millis;
  statusSince: Millis;
}

export type JobEventType =
  | "CREATED"
  | "OFFERED"
  | "MISSED"
  | "ACCEPTED"
  | "STATUS"
  | "ASSIGNED"
  | "PAUSED"
  | "RESUMED"
  | "CANCELLED"
  | "NOSHOW";

export interface JobEvent {
  id: ID;
  jobId: ID;
  type: JobEventType;
  at: Millis;
  text: string;
}

export interface FareQuote {
  tariffId: TariffId;
  label: string;
  price: number;
}

export type TariffId = "standard" | "large" | "exec";

export interface Tariff {
  id: TariffId;
  label: string;
  base: number;
  perMile: number;
  minimum: number;
}
