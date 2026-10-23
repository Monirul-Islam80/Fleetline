import { createAction, type Update } from "@reduxjs/toolkit";
import type { Snapshot } from "@/types/api";
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
}

export const realtimeReceived = createAction<RealtimeBatch>("realtime/received");
