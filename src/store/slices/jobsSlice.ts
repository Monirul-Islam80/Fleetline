import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Job, JobEvent } from "@/types/domain";
import { seeded, realtimeReceived } from "../actions";

export const jobsAdapter = createEntityAdapter<Job>();

const MAX_EVENTS = 300;

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
        if (action.payload.jobs.length) jobsAdapter.updateMany(state, action.payload.jobs);
        if (action.payload.events.length) {
          state.events.unshift(...action.payload.events);
          state.events.length = Math.min(state.events.length, MAX_EVENTS);
        }
      });
  },
});

export const { jobAdded, jobChanged } = jobsSlice.actions;
export default jobsSlice.reducer;
