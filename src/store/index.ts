import { combineReducers, configureStore, createAsyncThunk, type ThunkAction, type UnknownAction } from "@reduxjs/toolkit";
import type { ApiClient } from "@/api/client";
import { createLiveApi } from "@/api/live";
import { createMockApi } from "@/api/mock";
import { APP } from "@/config/app";
import booking from "./slices/bookingSlice";
import fleet from "./slices/fleetSlice";
import inbox from "./slices/inboxSlice";
import jobs from "./slices/jobsSlice";
import ui from "./slices/uiSlice";

const rootReducer = combineReducers({ jobs, fleet, booking, ui, inbox });

/** Thunks reach the backend only through `extra.api`, so swapping mock for live is one line. */
export interface ThunkExtra {
  api: ApiClient;
}

/** A fresh store per mount (Next.js App Router: never share a store between requests). */
export function makeStore() {
  const extra = {} as ThunkExtra;
  const store = configureStore({
    reducer: rootReducer,
    // The dev checks walk the whole state on every action; with 1 Hz updates they cost more than they catch.
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: extra }, serializableCheck: false, immutableCheck: false }),
  });
  extra.api = APP.apiMode === "live" ? createLiveApi(APP.apiUrl) : createMockApi(store.getState);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<R = void> = ThunkAction<R, RootState, ThunkExtra, UnknownAction>;

export const createAppThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch; extra: ThunkExtra; rejectValue: string }>();
