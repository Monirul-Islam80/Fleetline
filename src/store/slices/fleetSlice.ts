import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { ZONES } from "@/mock/geography";
import type { Customer, Driver, Millis, Zone } from "@/types/domain";
import { seeded, simulationApplied } from "../actions";

export const driversAdapter = createEntityAdapter<Driver>();

/** Drivers, zones, customers and the simulation clock: the slow-moving reference data plus live positions. */
const initialState = {
  drivers: driversAdapter.getInitialState(),
  zones: [...ZONES] as Zone[],
  customers: [] as Customer[],
  now: 0 as Millis,
  ready: false,
};

const fleetSlice = createSlice({
  name: "fleet",
  initialState,
  reducers: {
    driverChanged(state, action: PayloadAction<{ id: string; changes: Partial<Driver> }>) {
      driversAdapter.updateOne(state.drivers, action.payload);
    },
    zoneFlagsCleared(state) {
      state.zones = state.zones.map((z) => ({ ...z, surge: false, fullyBooked: false }));
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(seeded, (state, action) => {
        driversAdapter.setAll(state.drivers, action.payload.drivers);
        state.customers = action.payload.customers;
        state.zones = [...ZONES];
        state.now = action.payload.now;
        state.ready = true;
      })
      .addCase(simulationApplied, (state, action) => {
        state.now = action.payload.now;
        if (action.payload.drivers.length) driversAdapter.updateMany(state.drivers, action.payload.drivers);
        if (action.payload.zones) state.zones = action.payload.zones;
      });
  },
});

export const { driverChanged, zoneFlagsCleared } = fleetSlice.actions;
export default fleetSlice.reducer;
