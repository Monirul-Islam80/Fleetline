import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Alert, CallRequest, DriverChat, Flight, Operator, StaffMessage } from "@/types/domain";
import { realtimeReceived, seeded } from "../actions";
import { jobAdded } from "./jobsSlice";

/** Everything the counter tabs open: staff messages, driver chat, call queue, alerts, flights. */
interface InboxState {
  operators: Operator[];
  staffMessages: StaffMessage[];
  staffReadAt: number;
  driverChats: DriverChat[];
  callQueue: CallRequest[];
  alerts: Alert[];
  flights: Flight[];
}

const initialState: InboxState = {
  operators: [],
  staffMessages: [],
  staffReadAt: 0,
  driverChats: [],
  callQueue: [],
  alerts: [],
  flights: [],
};

const MAX_ALERTS = 200;

const inboxSlice = createSlice({
  name: "inbox",
  initialState,
  reducers: {
    staffMessageAdded(state, action: PayloadAction<StaffMessage>) {
      state.staffMessages.unshift(action.payload);
    },
    staffRead(state, action: PayloadAction<number>) {
      state.staffReadAt = action.payload;
    },
    chatTaken(state, action: PayloadAction<{ id: string; by: string }>) {
      const chat = state.driverChats.find((c) => c.id === action.payload.id);
      if (chat) chat.takenBy = action.payload.by;
    },
    chatDone(state, action: PayloadAction<string>) {
      state.driverChats = state.driverChats.filter((c) => c.id !== action.payload);
    },
    callTaken(state, action: PayloadAction<string>) {
      state.callQueue = state.callQueue.filter((c) => c.id !== action.payload);
    },
    alertDeleted(state, action: PayloadAction<string>) {
      state.alerts = state.alerts.filter((a) => a.id !== action.payload);
    },
    flightDeleted(state, action: PayloadAction<string>) {
      state.flights = state.flights.filter((f) => f.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(seeded, (state, action) => ({ ...initialState, ...action.payload.inbox }))
      .addCase(realtimeReceived, (state, action) => {
        if (!action.payload.alerts.length) return;
        state.alerts.unshift(...action.payload.alerts);
        state.alerts.length = Math.min(state.alerts.length, MAX_ALERTS);
      })
      .addCase(jobAdded, (state, action) => {
        const { job } = action.payload;
        if (job.source !== "APP") return;
        state.alerts.unshift({
          id: `al-${job.id}`,
          at: job.createdAt,
          kind: "APP_BOOKING",
          title: "New APP Booking",
          message: `CUST: ${job.customerName}\nPICKUP: ${job.pickup.label.toUpperCase()}, ${job.pickup.area.toUpperCase()}, ${job.pickup.postcode}`,
          jobId: job.id,
          callsign: null,
        });
      });
  },
});

export const { staffMessageAdded, staffRead, chatTaken, chatDone, callTaken, alertDeleted, flightDeleted } = inboxSlice.actions;
export default inboxSlice.reducer;
