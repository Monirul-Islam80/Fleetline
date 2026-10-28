import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { APP } from "@/config/app";
import { stopText } from "@/lib/stops";
import type { BookingOptions, Stop, TariffId, VehicleType } from "@/types/domain";

export interface ViaDraft {
  text: string;
  stop: Stop | null;
  name: string;
  phone: string;
  notes: string;
}

export interface BookingForm {
  date: string;
  time: string;
  phone: string;
  priority: string;
  pickupText: string;
  pickup: Stop | null;
  dropoffText: string;
  dropoff: Stop | null;
  vias: ViaDraft[];
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
  site: string;
  fareText: string;
  tariff: TariffId;
  customerId: string | null;
  altPhone: string;
  customerNotes: string;
  operatorNotes: string;
  excludeDrivers: string;
  options: BookingOptions;
}

/** Keys whose value is exactly `string`, i.e. fields edited with a plain text input. */
type PlainStringKeys<T> = { [K in keyof T]-?: string extends T[K] ? (T[K] extends string ? K : never) : never }[keyof T];
export type TextField = PlainStringKeys<BookingForm>;
export type BookingErrors = Partial<Record<keyof BookingForm, string>>;
export type StopTarget = "pickup" | "dropoff" | number;

export const MAX_VIAS = 4;

export const emptyVia = (): ViaDraft => ({ text: "", stop: null, name: "", phone: "", notes: "" });

export const emptyForm = (): BookingForm => ({
  date: "",
  time: "",
  phone: "",
  priority: "",
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
  passengers: "",
  taxis: "",
  vehicle: "SALOON",
  extras: "",
  leadMin: "",
  site: "",
  fareText: "",
  tariff: "standard",
  customerId: null,
  altPhone: "",
  customerNotes: "",
  operatorNotes: "",
  excludeDrivers: "",
  options: { sendSms: true, sendRingback: true, autoComplete: false },
});

interface BookingState {
  form: BookingForm;
  errors: BookingErrors;
  /** Bumped on reset so the form can put focus back on the phone field. */
  resetCount: number;
}

const initialState: BookingState = { form: emptyForm(), errors: {}, resetCount: 0 };

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
    optionsChanged(state, action: PayloadAction<BookingOptions>) {
      state.form.options = action.payload;
    },
    stopSelected(state, action: PayloadAction<{ target: StopTarget; stop: Stop }>) {
      const { target, stop } = action.payload;
      if (typeof target === "number") {
        const via = state.form.vias[target];
        if (via) Object.assign(via, { stop, text: stopText(stop) });
        return;
      }
      state.form[target] = stop;
      state.form[target === "pickup" ? "pickupText" : "dropoffText"] = stopText(stop);
      delete state.errors[target === "pickup" ? "pickupText" : "dropoffText"];
    },
    stopsSwapped(state) {
      const { pickup, pickupText, dropoff, dropoffText } = state.form;
      Object.assign(state.form, { pickup: dropoff, pickupText: dropoffText, dropoff: pickup, dropoffText: pickupText });
    },
    viaChanged(state, action: PayloadAction<{ index: number; patch: Partial<ViaDraft> }>) {
      const { index, patch } = action.payload;
      while (state.form.vias.length <= index && state.form.vias.length < MAX_VIAS) state.form.vias.push(emptyVia());
      const via = state.form.vias[index];
      if (!via) return;
      Object.assign(via, patch);
      if ("text" in patch) via.stop = null;
    },
    viaAdded(state) {
      if (state.form.vias.length < MAX_VIAS) state.form.vias.push(emptyVia());
    },
    viaRemoved(state, action: PayloadAction<number>) {
      state.form.vias.splice(action.payload, 1);
    },
    viasReplaced(state, action: PayloadAction<ViaDraft[]>) {
      state.form.vias = action.payload.slice(0, MAX_VIAS);
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
    formLoaded(state, action: PayloadAction<Partial<BookingForm>>) {
      state.form = { ...emptyForm(), ...action.payload };
      state.errors = {};
    },
  },
});

export const {
  fieldChanged,
  vehicleChanged,
  optionsChanged,
  stopSelected,
  stopsSwapped,
  viaChanged,
  viaAdded,
  viaRemoved,
  viasReplaced,
  tariffSelected,
  callerMatched,
  callerCleared,
  errorsSet,
  formReset,
  formLoaded,
} = bookingSlice.actions;
export default bookingSlice.reducer;

/** Defaults applied at save time, so empty inputs keep showing their placeholder hints. */
export const FORM_DEFAULTS = { passengers: 1, taxis: 1, priority: 5, leadMin: APP.defaultLeadMin } as const;
