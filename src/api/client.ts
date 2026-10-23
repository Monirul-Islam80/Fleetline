import type {
  BookingQuery,
  BroadcastInput,
  CreateJobInput,
  DriverQuery,
  DriverTrack,
  JobAction,
  LogQuery,
  Page,
  Snapshot,
} from "@/types/api";
import type { Customer, Driver, Job, LatLng, LogEntry, Millis, StaffMessage, Stop } from "@/types/domain";

/**
 * Every call the console makes to the backend, in one interface.
 * `mock.ts` answers from seeded data in the browser; `live.ts` maps each call to an HTTP endpoint.
 * To connect the real backend, implement the endpoints listed in live.ts and set NEXT_PUBLIC_API_MODE=live.
 */
export interface ApiClient {
  /** Everything the console needs on load: jobs, drivers, customers, inbox. */
  bootstrap(): Promise<Snapshot>;
  createJob(input: CreateJobInput): Promise<Job>;
  jobAction(jobId: string, action: JobAction, callsign?: string): Promise<void>;
  lookupCustomer(phone: string): Promise<Customer | null>;
  searchPlaces(query: string): Promise<Stop[]>;
  searchBookings(query: BookingQuery): Promise<Page<Job>>;
  searchDrivers(query: DriverQuery): Promise<Driver[]>;
  searchLogs(query: LogQuery): Promise<LogEntry[]>;
  sendStaffMessage(to: string, body: string): Promise<StaffMessage>;
  sendBroadcast(input: BroadcastInput): Promise<void>;
  takeChat(chatId: string): Promise<void>;
  closeChat(chatId: string): Promise<void>;
  takeCall(callId: string): Promise<void>;
  deleteAlert(alertId: string): Promise<void>;
  deleteFlight(flightId: string): Promise<void>;
  clearZoneFlags(): Promise<void>;
  driverTracks(query: { from: Millis; to: Millis; centre: LatLng; radiusM: number }): Promise<DriverTrack[]>;
}
