import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { seeded } from "../actions";

/**
 * Placeholder counters for channels the demo does not integrate yet (telephony, chat).
 * The real system feeds these from the realtime channel.
 */
export interface CommsState {
  callQueue: number;
  driverChat: number;
  messages: number;
  staffMessages: number;
}

const initialState: CommsState = { callQueue: 3, driverChat: 2, messages: 1, staffMessages: 0 };

type CommsKey = keyof CommsState;

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, n));

const commsSlice = createSlice({
  name: "comms",
  initialState,
  reducers: {
    commsDrifted(state, action: PayloadAction<Partial<Record<CommsKey, number>>>) {
      for (const [key, delta] of Object.entries(action.payload) as [CommsKey, number][]) {
        state[key] = clamp(state[key] + delta, 25);
      }
    },
    commsCleared(state, action: PayloadAction<CommsKey>) {
      state[action.payload] = 0;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(seeded, () => initialState);
  },
});

export const { commsDrifted, commsCleared } = commsSlice.actions;
export default commsSlice.reducer;
