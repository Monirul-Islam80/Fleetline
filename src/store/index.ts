import { combineReducers, configureStore } from "@reduxjs/toolkit";
import booking from "./slices/bookingSlice";
import comms from "./slices/commsSlice";
import fleet from "./slices/fleetSlice";
import jobs from "./slices/jobsSlice";
import ui from "./slices/uiSlice";

const rootReducer = combineReducers({ jobs, fleet, booking, ui, comms });

/** A fresh store per mount (Next.js App Router pattern: never share a store between requests). */
export const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    // The checks walk the whole state on every action; with 1 Hz ticks they cost more than they catch.
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = (dispatch: AppDispatch, getState: () => RootState) => R;
