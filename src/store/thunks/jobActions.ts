import { ACTIVE_TRIP } from "@/config/status";
import type { JobAction } from "@/types/api";
import type { Job } from "@/types/domain";
import type { AppThunk, RootState } from "../index";
import { driverChanged } from "../slices/fleetSlice";
import { jobChanged } from "../slices/jobsSlice";
import { toastShown } from "../slices/uiSlice";
import { makeEvent } from "./events";

/**
 * Operator actions on a job. Each one calls the API, then applies the same change locally so the
 * grid updates at once. With the live backend the realtime batch confirms it a moment later.
 */

const STATUS_AFTER: Record<Exclude<JobAction, "assign">, { patch: Partial<Job>; text: string }> = {
  pause: { patch: { status: "PAUSED", offer: null }, text: "Paused by operator" },
  resume: { patch: { status: "NEW", missedBy: [] }, text: "Resumed by operator" },
  redispatch: { patch: { status: "NEW", driverId: null, offer: null, missedBy: [] }, text: "Re-dispatched by operator" },
  cancel: { patch: { status: "CANCELLED", offer: null }, text: "Cancelled by operator" },
  noshow: { patch: { status: "NOSHOW", offer: null }, text: "No-show set by operator" },
};

const EVENT_TYPE = { pause: "PAUSED", resume: "RESUMED", redispatch: "STATUS", cancel: "CANCELLED", noshow: "NOSHOW" } as const;

function freeDriver(state: RootState, job: Job): Parameters<typeof driverChanged>[0] | null {
  const driverId = job.driverId ?? job.offer?.driverId;
  const driver = driverId ? state.fleet.drivers.entities[driverId] : undefined;
  if (!driver || (driver.currentJobId !== job.id && driver.status !== "OFFERED")) return null;
  return { id: driver.id, changes: { status: "AVAILABLE", currentJobId: null, target: null } };
}

export const runJobAction =
  (jobId: string, action: Exclude<JobAction, "assign">): AppThunk<Promise<void>> =>
  async (dispatch, getState, { api }) => {
    const job = getState().jobs.entities[jobId];
    if (!job) return;
    try {
      await api.jobAction(jobId, action);
    } catch (error) {
      dispatch(toastShown({ tone: "danger", text: (error as Error).message }));
      return;
    }
    const state = getState();
    const free = action === "resume" ? null : freeDriver(state, job);
    if (free) dispatch(driverChanged(free));
    const now = state.fleet.now;
    const { patch, text } = STATUS_AFTER[action];
    dispatch(jobChanged({ id: jobId, changes: { ...patch, statusSince: now, updatedAt: now }, event: makeEvent(jobId, EVENT_TYPE[action], text, now) }));
  };

/** Manual allocation by callsign. Resolves to an error message, or null when assigned. */
export const assignJob =
  (jobId: string, callsign: string): AppThunk<Promise<string | null>> =>
  async (dispatch, getState, { api }) => {
    const state = getState();
    const job = state.jobs.entities[jobId];
    const driver = Object.values(state.fleet.drivers.entities).find((d) => d?.callsign === callsign.trim());
    if (!job) return "Job not found";
    if (!driver) return "No driver with that callsign";
    const current = driver.currentJobId ? state.jobs.entities[driver.currentJobId] : undefined;
    if (current && ACTIVE_TRIP.has(current.status)) return `${driver.callsign} is on another job`;
    try {
      await api.jobAction(jobId, "assign", driver.callsign);
    } catch (error) {
      return (error as Error).message;
    }
    const free = freeDriver(getState(), job);
    if (free) dispatch(driverChanged(free));
    const now = getState().fleet.now;
    dispatch(jobChanged({ id: jobId, changes: { status: "ENROUTE", driverId: driver.id, offer: null, statusSince: now, updatedAt: now }, event: makeEvent(jobId, "ASSIGNED", `Allocated to ${driver.callsign}`, now) }));
    dispatch(driverChanged({ id: driver.id, changes: { status: "ENROUTE", currentJobId: jobId, target: { lat: job.pickup.lat, lng: job.pickup.lng }, statusSince: now } }));
    dispatch(toastShown({ tone: "success", text: `Job ${job.number} allocated to ${driver.callsign}` }));
    return null;
  };
