import { createAction, type Update } from "@reduxjs/toolkit";
import type { SeedData } from "@/mock/seed";
import type { Driver, Job, JobEvent, Millis, Zone } from "@/types/domain";

/** Loads (or reloads) the whole demo dataset. Every data slice listens to this. */
export const seeded = createAction<SeedData & { now: Millis }>("data/seeded");

/**
 * One action per simulation tick so the UI re-renders once per second, not once per change.
 * When the real backend arrives, socket messages map onto this same action.
 */
export const simulationApplied = createAction<{
  now: Millis;
  jobs: Update<Job, string>[];
  drivers: Update<Driver, string>[];
  events: JobEvent[];
  zones?: Zone[];
}>("sim/applied");
