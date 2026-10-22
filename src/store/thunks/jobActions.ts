import { ACTIVE_TRIP } from "@/config/status";
import type { Job } from "@/types/domain";
import type { AppThunk, RootState } from "../index";
import { driverChanged } from "../slices/fleetSlice";
import { jobChanged } from "../slices/jobsSlice";
import { toastShown } from "../slices/uiSlice";
import { makeEvent } from "./events";

/** Operator actions on a job. Each one maps to a future POST /jobs/:id/<action>. */

const getJob = (state: RootState, id: string): Job | undefined => state.jobs.entities[id];

/** Returns the job's driver (or pending offer driver) to the free pool. */
const freeDriverOf = (job: Job): AppThunk => (dispatch, getState) => {
  const driverId = job.driverId ?? job.offer?.driverId;
  if (!driverId) return;
  const driver = getState().fleet.drivers.entities[driverId];
  if (driver && (driver.currentJobId === job.id || driver.status === "OFFERED")) {
    dispatch(driverChanged({ id: driverId, changes: { status: "AVAILABLE", currentJobId: null, target: null } }));
  }
};

export const pauseJob = (id: string): AppThunk => (dispatch, getState) => {
  const state = getState();
  const job = getJob(state, id);
  if (!job || (job.status !== "NEW" && job.status !== "BIDDING")) return;
  dispatch(freeDriverOf(job));
  const now = state.fleet.now;
  dispatch(jobChanged({ id, changes: { status: "PAUSED", offer: null, statusSince: now, updatedAt: now }, event: makeEvent(id, "PAUSED", "Paused by operator", now) }));
};

export const resumeJob = (id: string): AppThunk => (dispatch, getState) => {
  const now = getState().fleet.now;
  dispatch(jobChanged({ id, changes: { status: "NEW", missedBy: [], statusSince: now, updatedAt: now }, event: makeEvent(id, "RESUMED", "Resumed, dispatching again", now) }));
};

export const redispatchJob = (id: string): AppThunk => (dispatch, getState) => {
  const state = getState();
  const job = getJob(state, id);
  if (!job) return;
  dispatch(freeDriverOf(job));
  const now = state.fleet.now;
  dispatch(jobChanged({ id, changes: { status: "NEW", driverId: null, offer: null, missedBy: [], statusSince: now, updatedAt: now }, event: makeEvent(id, "STATUS", "Re-dispatched by operator", now) }));
  dispatch(toastShown({ tone: "info", text: `Job ${job.number} is dispatching again` }));
};

export const cancelJob = (id: string): AppThunk => (dispatch, getState) => {
  const state = getState();
  const job = getJob(state, id);
  if (!job) return;
  dispatch(freeDriverOf(job));
  const now = state.fleet.now;
  dispatch(jobChanged({ id, changes: { status: "CANCELLED", offer: null, statusSince: now, updatedAt: now }, event: makeEvent(id, "CANCELLED", "Cancelled by operator", now) }));
  dispatch(toastShown({ tone: "warning", text: `Job ${job.number} cancelled` }));
};

export const markNoShow = (id: string): AppThunk => (dispatch, getState) => {
  const state = getState();
  const job = getJob(state, id);
  if (!job) return;
  dispatch(freeDriverOf(job));
  const now = state.fleet.now;
  dispatch(jobChanged({ id, changes: { status: "NOSHOW", statusSince: now, updatedAt: now }, event: makeEvent(id, "NOSHOW", "Marked no-show by operator", now) }));
};

/** Manual assignment by callsign. Returns an error message, or null when assigned. */
export const assignJob = (id: string, callsign: string): AppThunk<string | null> => (dispatch, getState) => {
  const state = getState();
  const job = getJob(state, id);
  if (!job) return "Job not found";
  const driver = Object.values(state.fleet.drivers.entities).find((d) => d?.callsign === callsign.trim());
  if (!driver) return "No driver with that callsign";
  if (driver.currentJobId && ACTIVE_TRIP.has(state.jobs.entities[driver.currentJobId]?.status ?? "NEW")) {
    return `${driver.callsign} is on another job`;
  }
  dispatch(freeDriverOf(job));
  const now = state.fleet.now;
  dispatch(jobChanged({ id, changes: { status: "ENROUTE", driverId: driver.id, offer: null, statusSince: now, updatedAt: now }, event: makeEvent(id, "ASSIGNED", `Assigned to ${driver.callsign} by operator`, now) }));
  dispatch(driverChanged({ id: driver.id, changes: { status: "ENROUTE", currentJobId: id, target: { lat: job.pickup.lat, lng: job.pickup.lng }, statusSince: now } }));
  dispatch(toastShown({ tone: "success", text: `Job ${job.number} assigned to ${driver.callsign}` }));
  return null;
};
