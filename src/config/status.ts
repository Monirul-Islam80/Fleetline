import type { DriverStatus, JobStatus } from "@/types/domain";

/** One status language for the grid, map and lists. `tone` maps to the CSS variable --tone-<tone>. */
export type Tone = "free" | "offer" | "enroute" | "arrived" | "onboard" | "ending" | "held" | "bid" | "problem" | "done" | "off" | "booked";

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  BOOKED: { label: "BOOKED", tone: "booked" },
  NEW: { label: "DISPATCHING", tone: "offer" },
  PAUSED: { label: "PAUSED", tone: "held" },
  BIDDING: { label: "BIDDING", tone: "bid" },
  ENROUTE: { label: "ENROUTE", tone: "enroute" },
  ARRIVED: { label: "ARRIVED", tone: "arrived" },
  POB: { label: "POB", tone: "onboard" },
  DROPPINGOFF: { label: "DROPPING OFF", tone: "ending" },
  COMPLETED: { label: "COMPLETED", tone: "done" },
  NOSHOW: { label: "NO SHOW", tone: "problem" },
  CANCELLED: { label: "CANCELLED", tone: "problem" },
};

export const DRIVER_STATUS: Record<DriverStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "free" },
  PARKED: { label: "Parked", tone: "free" },
  OFFERED: { label: "Offer pending", tone: "offer" },
  ENROUTE: { label: "To pickup", tone: "enroute" },
  ARRIVED: { label: "At pickup", tone: "arrived" },
  POB: { label: "On board", tone: "onboard" },
  DROPPING: { label: "Dropping", tone: "ending" },
  AWAY: { label: "Away", tone: "off" },
};

export const DISPATCHABLE: ReadonlySet<DriverStatus> = new Set(["AVAILABLE", "PARKED"]);
export const ACTIVE_TRIP: ReadonlySet<JobStatus> = new Set(["ENROUTE", "ARRIVED", "POB", "DROPPINGOFF"]);
export const UNASSIGNED: ReadonlySet<JobStatus> = new Set(["NEW", "PAUSED", "BIDDING"]);
export const TERMINAL: ReadonlySet<JobStatus> = new Set(["COMPLETED", "CANCELLED", "NOSHOW"]);

export type JobTab = "dispatch" | "prebooked" | "booked" | "completed" | "cancelled" | "noshow" | "network" | "flights";

export const JOB_TABS: readonly { id: JobTab; label: string }[] = [
  { id: "dispatch", label: "DISPATCH" },
  { id: "prebooked", label: "PRE-BOOKED" },
  { id: "booked", label: "BOOKED" },
  { id: "completed", label: "COMPLETED" },
  { id: "cancelled", label: "CANCELLED" },
  { id: "noshow", label: "NOSHOW" },
  { id: "network", label: "NETWORK" },
  { id: "flights", label: "FLIGHTS" },
];
