import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { APP } from "@/config/app";
import { stopText } from "@/lib/stops";
import type { Stop, TariffId, VehicleType } from "@/types/domain";

export interface BookingForm {
  /** Empty string means today. */
  date: string;
  /** Empty string means as soon as possible. */
  time: string;
  phone: string;
  priority: string;
  pickupText: string;
  pickup: Stop | null;
  dropoffText: string;
  dropoff: Stop | null;
  vias: Stop[];
  name: string;
  email: string;
  instructions: string;
  driverCallsign: string;
  account: string;
  pin: string;
  passengers: string;
  taxis: string;
  vehicle: VehicleType;
  extras: string;
  leadMin: string;
  /** Text in the fare box. Empty means "use the selected tariff". */
  fareText: string;
  tariff: TariffId;
  customerId: string | null;
}

/** Keys whose value is exactly `string` (not a narrower union such as VehicleType). */
type PlainStringKeys<T> = { [K in keyof T]-?: string extends T[K] ? (T[K] extends string ? K : never) : never }[keyof T];

/** Fields edited as plain text inputs. */
export type TextField = PlainStringKeys<BookingForm>;

export type BookingErrors = Partial<Record<keyof BookingForm, string>>;

export const emptyForm = (): BookingForm => ({
  date: "",
  time: "",
  phone: "",
  priority: "5",
  pickupText: "",
  pickup: null,
  dropoffText: "",
  dropoff: null,
  vias: [],
  name: "",
  email: "",
  instructions: "",
  driverCallsign: "",
  account: "",
  pin: "",
  passengers: "1",
  taxis: "1",
  vehicle: "SALOON",
  extras: "",
  leadMin: String(APP.defaultLeadMin),
  fareText: "",
  tariff: "standard",
  customerId: null,
});

interface BookingState {
  form: BookingForm;
  errors: BookingErrors;
  /** Bumped on reset so inputs can re-focus the phone field. */
  resetCount: number;
}

const initialState: BookingState = { form: emptyForm(), errors: {}, resetCount: 0 };

type StopField = "pickup" | "dropoff";

const bookingSlice = createSlice({
  name: "booking",
  initialState,
  reducers: {
    fieldChanged(state, action: PayloadAction<{ field: TextField; value: string }>) {
      const { field, value } = action.payload;
      state.form[field] = value;
      delete state.errors[field];
      if (field === "pickupText") state.form.pickup = null;
      if (field === "dropoffText") state.form.dropoff = null;
    },
    vehicleChanged(state, action: PayloadAction<VehicleType>) {
      state.form.vehicle = action.payload;
    },
    stopSelected(state, action: PayloadAction<{ field: StopField; stop: Stop }>) {
      const { field, stop } = action.payload;
      state.form[field] = stop;
      state.form[field === "pickup" ? "pickupText" : "dropoffText"] = stopText(stop);
      delete state.errors[field === "pickup" ? "pickupText" : "dropoffText"];
    },
    stopsSwapped(state) {
      const { pickup, pickupText, dropoff, dropoffText } = state.form;
      state.form.pickup = dropoff;
      state.form.pickupText = dropoffText;
      state.form.dropoff = pickup;
      state.form.dropoffText = pickupText;
    },
    viaAdded(state, action: PayloadAction<Stop>) {
      state.form.vias.push(action.payload);
    },
    viaRemoved(state, action: PayloadAction<number>) {
      state.form.vias.splice(action.payload, 1);
    },
    tariffSelected(state, action: PayloadAction<TariffId>) {
      state.form.tariff = action.payload;
      state.form.fareText = "";
    },
    callerMatched(state, action: PayloadAction<{ customerId: string; name: string; email: string | null; account: string | null }>) {
      const { customerId, name, email, account } = action.payload;
      state.form.customerId = customerId;
      if (!state.form.name) state.form.name = name;
      if (!state.form.email && email) state.form.email = email;
      if (!state.form.account && account) state.form.account = account;
    },
    callerCleared(state) {
      state.form.customerId = null;
    },
    errorsSet(state, action: PayloadAction<BookingErrors>) {
      state.errors = action.payload;
    },
    formReset(state) {
      state.form = emptyForm();
      state.errors = {};
      state.resetCount += 1;
    },
    formLoaded(state, action: PayloadAction<BookingForm>) {
      state.form = action.payload;
      state.errors = {};
    },
  },
});

export const {
  fieldChanged,
  vehicleChanged,
  stopSelected,
  stopsSwapped,
  viaAdded,
  viaRemoved,
  tariffSelected,
  callerMatched,
  callerCleared,
  errorsSet,
  formReset,
  formLoaded,
} = bookingSlice.actions;
export default bookingSlice.reducer;
