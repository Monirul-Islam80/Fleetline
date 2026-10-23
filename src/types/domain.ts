/** Core domain types. Shapes mirror the planned Postgres schema so mock data and API data are interchangeable. */

export type ID = string;
/** Epoch milliseconds. Numbers keep Redux state serializable. */
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

export type DriverStatus = "AVAILABLE" | "PARKED" | "OFFERED" | "ENROUTE" | "ARRIVED" | "POB" | "DROPPING" | "AWAY";

export type VehicleType = "SALOON" | "ESTATE" | "MPV" | "EXEC" | "WAV";
export type BookingSource = "PHONE" | "APP" | "WEB";
export type PaymentType = "CASH" | "CARD" | "ACCOUNT";
export type TariffId = "standard" | "large" | "exec";

export interface Place extends LatLng {
  id: ID;
  label: string;
  area: string;
  postcode: string;
  zoneId: ID;
}

/** A stop on a job: a snapshot of the place at booking time. */
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

export interface Site {
  id: ID;
  name: string;
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
  phone: string;
  plate: string;
  badge: string;
  appVersion: string;
  siteId: ID;
  vehicle: VehicleType;
  seats: number;
  status: DriverStatus;
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
  /** Simulator only: when the bot driver answers, or null if it lets the offer expire. */
  decideAt: Millis | null;
}

export interface BookingOptions {
  sendSms: boolean;
  sendRingback: boolean;
  autoComplete: boolean;
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
  extras: string;
  pickup: Stop;
  vias: Stop[];
  dropoff: Stop | null;
  customerName: string;
  phone: string;
  altPhone: string;
  email: string | null;
  instructions: string;
  customerNotes: string;
  operatorNotes: string;
  excludeDrivers: string[];
  accountCode: string | null;
  payment: PaymentType;
  source: BookingSource;
  siteId: ID;
  fare: number | null;
  fareOverridden: boolean;
  driverId: ID | null;
  designatedDriverId: ID | null;
  offer: Offer | null;
  missedBy: string[];
  flightNo: string | null;
  isRecurring: boolean;
  options: BookingOptions;
  createdBy: string;
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

export interface Tariff {
  id: TariffId;
  label: string;
  base: number;
  perMile: number;
  minimum: number;
}

export interface FareQuote {
  tariffId: TariffId;
  label: string;
  price: number;
}

/* ---------- Comms: what the counter tabs open ---------- */

export interface Operator {
  id: ID;
  name: string;
  online: boolean;
  bookingsLastHour: number;
}

export interface StaffMessage {
  id: ID;
  from: string;
  to: string;
  body: string;
  at: Millis;
}

export interface DriverChat {
  id: ID;
  callsign: string;
  response: string;
  original: string;
  messageAt: Millis;
  responseAt: Millis;
  takenBy: string | null;
}

export interface CallRequest {
  id: ID;
  position: number;
  callsign: string;
  phone: string;
  name: string;
  booking: string | null;
  at: Millis;
}

export type AlertKind = "APP_BOOKING" | "DRIVER_LOGOUT" | "NOSHOW" | "MISSED";

export interface Alert {
  id: ID;
  at: Millis;
  kind: AlertKind;
  title: string;
  message: string;
  jobId: ID | null;
  callsign: string | null;
}

export interface Flight {
  id: ID;
  airline: string;
  number: string;
  from: string;
  to: string;
  scheduled: Millis;
  arrival: Millis;
  status: "Scheduled" | "Delayed" | "Landed";
  bookings: number;
}

export type LogCategory = "SYSTEM" | "DRIVER" | "ZONE" | "FEEDERSET" | "PANIC" | "OPERATOR";

export interface LogEntry {
  id: ID;
  at: Millis;
  category: LogCategory;
  driver: string;
  vehicle: string;
  zone: string;
  jobNumber: string;
  operator: string;
  action: string;
  text: string;
}
