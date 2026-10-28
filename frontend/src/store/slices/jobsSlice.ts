import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Job, JobEvent } from "@/types/domain";
import { seeded, realtimeReceived } from "../actions";

export const jobsAdapter = createEntityAdapter<Job>();

const MAX_EVENTS = 300;

/**
 * Operator actions add their event locally at once; the server then sends its own copy. Skip a server
 * event that matches a recent local one (same job, type and text within 15 s) so it shows once.
 */
function isEcho(existing: JobEvent[], incoming: JobEvent): boolean {
  return existing
    .slice(0, 40)
    .some((e) => e.jobId === incoming.jobId && e.type === incoming.type && e.text === incoming.text && Math.abs(e.at - incoming.at) < 15_000);
}

const initialState = jobsAdapter.getInitialState({
  nextNumber: 1,
  /** Newest first. Feeds the drawer timeline and the alerts drawer. */
  events: [] as JobEvent[],
});

const jobsSlice = createSlice({
  name: "jobs",
  initialState,
  reducers: {
    jobAdded(state, action: PayloadAction<{ job: Job; event: JobEvent }>) {
      jobsAdapter.addOne(state, action.payload.job);
      state.nextNumber = Math.max(state.nextNumber, action.payload.job.number + 1);
      state.events.unshift(action.payload.event);
    },
    jobChanged(state, action: PayloadAction<{ id: string; changes: Partial<Job>; event: JobEvent }>) {
      jobsAdapter.updateOne(state, { id: action.payload.id, changes: action.payload.changes });
      state.events.unshift(action.payload.event);
      state.events.length = Math.min(state.events.length, MAX_EVENTS);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(seeded, (state, action) => {
        jobsAdapter.setAll(state, action.payload.jobs);
        state.nextNumber = action.payload.nextJobNumber;
        state.events = [];
      })
      .addCase(realtimeReceived, (state, action) => {
        const { added, removed } = action.payload;
        if (added?.length) {
          jobsAdapter.upsertMany(state, added);
          state.nextNumber = Math.max(state.nextNumber, ...added.map((j) => j.number + 1));
        }
        if (removed?.length) jobsAdapter.removeMany(state, removed);
        if (action.payload.jobs.length) jobsAdapter.updateMany(state, action.payload.jobs);
        const events = action.payload.events.filter((e) => !isEcho(state.events, e));
        if (events.length) {
          state.events.unshift(...events);
          state.events.length = Math.min(state.events.length, MAX_EVENTS);
        }
      });
  },
});

export const { jobAdded, jobChanged } = jobsSlice.actions;
export default jobsSlice.reducer;
