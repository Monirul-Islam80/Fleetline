import { createAction, type Update } from "@reduxjs/toolkit";
import type { IncomingCall, Snapshot } from "@/types/api";
import type { Alert, Driver, Job, JobEvent, Millis, Zone } from "@/types/domain";

/** Loads (or reloads) the whole dataset. Every data slice listens to this. */
export const seeded = createAction<Snapshot & { now: Millis }>("data/seeded");

/**
 * The realtime contract: one batched message per tick. The mock engine emits it once a second;
 * the live socket must send the same shape and nothing in the UI changes.
 */
export interface RealtimeBatch {
  now: Millis;
  jobs: Update<Job, string>[];
  drivers: Update<Driver, string>[];
  events: JobEvent[];
  alerts: Alert[];
  zones?: Zone[];
  /** Live backend only: jobs created elsewhere (other operators, the passenger app, IVR). */
  added?: Job[];
  /** Live backend only: jobs deleted. */
  removed?: string[];
  /** Live backend only: incoming calls for the screen pop. */
  calls?: IncomingCall[];
}

export const realtimeReceived = createAction<RealtimeBatch>("realtime/received");
