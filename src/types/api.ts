import type {
  Alert,
  BookingOptions,
  CallRequest,
  DriverChat,
  Flight,
  Operator,
  BookingSource,
  Customer,
  Driver,
  Job,
  JobStatus,
  LogCategory,
  LogEntry,
  Millis,
  PaymentType,
  StaffMessage,
  Stop,
  VehicleType,
} from "./domain";

/** Request and response shapes for the backend. The mock and live clients share them. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** What the booking form sends. The server assigns id, number and status. */
export interface CreateJobInput {
  pickupAt: Millis;
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
  siteId: string;
  fare: number | null;
  fareOverridden: boolean;
  designatedCallsign: string | null;
  options: BookingOptions;
}

export type JobAction = "pause" | "resume" | "redispatch" | "cancel" | "noshow" | "assign";

export interface BookingQuery {
  /** Fleet dates as typed ("today", "24/10"), with HHMM times. */
  from: string;
  fromTime: string;
  to: string;
  toTime: string;
  siteId: string;
  jobNumber: string;
  source: BookingSource | "ALL";
  status: JobStatus | "ALL";
  driver: string;
  address: string;
  destination: string;
  customerName: string;
  customerPhone: string;
  account: string;
  keyword: string;
  page: number;
  pageSize: number;
}

export interface DriverQuery {
  ref: string;
  vehicleRef: string;
  imei: string;
  name: string;
  badge: string;
  plate: string;
  phone: string;
  version: string;
  siteId: string;
  active: "ALL" | "ONLINE" | "OFFLINE";
  sort: "callsign" | "name";
}

export interface LogQuery {
  day: Millis;
  driver: string;
  vehicle: string;
  zone: string;
  jobNumber: string;
  operator: string;
  action: string;
  categories: LogCategory[];
  oldestFirst: boolean;
}

export interface BroadcastInput {
  audience: "ONLINE_APP" | "ALL" | "ZONE";
  message: string;
  driver: string;
  question: boolean;
  type: "INFO" | "ALERT";
  lifetime: string;
  zone: string;
  vehicle: VehicleType | "ANY";
  siteId: string;
}

/** Initial load. The mock builds it from seed data; the live API returns it from GET /snapshot. */
export interface Snapshot {
  customers: Customer[];
  drivers: Driver[];
  jobs: Job[];
  nextJobNumber: number;
  inbox: {
    operators: Operator[];
    staffMessages: StaffMessage[];
    driverChats: DriverChat[];
    callQueue: CallRequest[];
    alerts: Alert[];
    flights: Flight[];
  };
}

export interface TrackPoint {
  lat: number;
  lng: number;
  at: Millis;
}

export interface DriverTrack {
  callsign: string;
  points: TrackPoint[];
}

export type { Customer, Driver, Job, LogEntry, StaffMessage };
