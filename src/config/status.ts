import type { DriverStatus, JobStatus } from "@/types/domain";

/**
 * One status language for the grid, map, legend and drawer.
 * `tone` maps to a CSS custom property: var(--tone-<tone>).
 */
export type Tone =
  | "free"
  | "waiting"
  | "enroute"
  | "arrived"
  | "onboard"
  | "ending"
  | "held"
  | "bidding"
  | "problem"
  | "done"
  | "off"
  | "booked";

interface StatusMeta {
  label: string;
  tone: Tone;
}

export const JOB_STATUS: Record<JobStatus, StatusMeta> = {
  BOOKED: { label: "Booked", tone: "booked" },
  NEW: { label: "Dispatching", tone: "waiting" },
  PAUSED: { label: "Paused", tone: "held" },
  BIDDING: { label: "Open to bid", tone: "bidding" },
  ENROUTE: { label: "En route", tone: "enroute" },
  ARRIVED: { label: "Arrived", tone: "arrived" },
  POB: { label: "On board", tone: "onboard" },
  DROPPINGOFF: { label: "Dropping off", tone: "ending" },
  COMPLETED: { label: "Completed", tone: "done" },
  NOSHOW: { label: "No-show", tone: "problem" },
  CANCELLED: { label: "Cancelled", tone: "problem" },
};

export const DRIVER_STATUS: Record<DriverStatus, StatusMeta> = {
  AVAILABLE: { label: "Available", tone: "free" },
  PARKED: { label: "Parked", tone: "free" },
  OFFERED: { label: "Offer pending", tone: "waiting" },
  ENROUTE: { label: "To pickup", tone: "enroute" },
  ARRIVED: { label: "At pickup", tone: "arrived" },
  POB: { label: "On board", tone: "onboard" },
  DROPPING: { label: "Dropping off", tone: "ending" },
  AWAY: { label: "Away", tone: "off" },
};

/** Driver states that can receive an offer. */
export const DISPATCHABLE: ReadonlySet<DriverStatus> = new Set(["AVAILABLE", "PARKED"]);

/** Job states that keep a driver busy. */
export const ACTIVE_TRIP: ReadonlySet<JobStatus> = new Set(["ENROUTE", "ARRIVED", "POB", "DROPPINGOFF"]);

/** Job states still waiting for a driver. Used for the overdue rule. */
export const UNASSIGNED: ReadonlySet<JobStatus> = new Set(["NEW", "PAUSED", "BIDDING"]);

export type JobTab =
  | "dispatch"
  | "prebooked"
  | "booked"
  | "completed"
  | "cancelled"
  | "noshow"
  | "network"
  | "flights";

export const JOB_TABS: readonly { id: JobTab; label: string }[] = [
  { id: "dispatch", label: "Dispatch" },
  { id: "prebooked", label: "Pre-booked" },
  { id: "booked", label: "Booked later" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "noshow", label: "No-show" },
  { id: "network", label: "Network" },
  { id: "flights", label: "Flights" },
];

/** Legend order shown under the map and in the grid header. */
export const LEGEND: readonly { tone: Tone; label: string }[] = [
  { tone: "free", label: "Free" },
  { tone: "waiting", label: "Offering" },
  { tone: "enroute", label: "To pickup" },
  { tone: "arrived", label: "At pickup" },
  { tone: "onboard", label: "On board" },
  { tone: "ending", label: "Dropping" },
  { tone: "off", label: "Away" },
];
