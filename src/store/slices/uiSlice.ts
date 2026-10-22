import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { JobTab } from "@/config/status";
import { seeded } from "../actions";

export type SortKey = "time" | "status" | "driver" | "pickup" | "dropoff" | "name" | "fare" | "zone" | "priority";
export type SortDir = "asc" | "desc";
export type DrawerId = "job" | "alerts" | "calls" | "chat" | "messages" | "staff" | "flights" | "inactive" | "zones";
export type ToastTone = "info" | "success" | "warning" | "danger";
export type Theme = "dark" | "light";

export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

export interface UiState {
  tab: JobTab;
  sort: { key: SortKey; dir: SortDir };
  windowHours: number;
  filters: { recurring: boolean; flights: boolean; accounts: boolean };
  gridQuery: string;
  selectedJobId: string | null;
  drawer: DrawerId | null;
  shortcutsOpen: boolean;
  theme: Theme;
  demoMode: boolean;
  paused: boolean;
  showZones: boolean;
  focusedDriverId: string | null;
  toasts: Toast[];
  nextToastId: number;
  /** Alerts raised before this time count as read. */
  alertsReadAt: number;
}

const initialState: UiState = {
  tab: "dispatch",
  sort: { key: "time", dir: "asc" },
  windowHours: 4,
  filters: { recurring: true, flights: true, accounts: true },
  gridQuery: "",
  selectedJobId: null,
  drawer: null,
  shortcutsOpen: false,
  theme: "dark",
  demoMode: false,
  paused: false,
  showZones: true,
  focusedDriverId: null,
  toasts: [],
  nextToastId: 1,
  alertsReadAt: 0,
};

type FilterKey = keyof UiState["filters"];

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    tabChanged(state, action: PayloadAction<JobTab>) {
      state.tab = action.payload;
    },
    sortToggled(state, action: PayloadAction<SortKey>) {
      state.sort =
        state.sort.key === action.payload
          ? { key: action.payload, dir: state.sort.dir === "asc" ? "desc" : "asc" }
          : { key: action.payload, dir: "asc" };
    },
    windowChanged(state, action: PayloadAction<number>) {
      state.windowHours = action.payload;
    },
    filterToggled(state, action: PayloadAction<FilterKey>) {
      state.filters[action.payload] = !state.filters[action.payload];
    },
    gridQueryChanged(state, action: PayloadAction<string>) {
      state.gridQuery = action.payload;
    },
    jobSelected(state, action: PayloadAction<string | null>) {
      state.selectedJobId = action.payload;
      state.drawer = action.payload ? "job" : null;
    },
    drawerOpened: {
      reducer(state, action: PayloadAction<{ id: DrawerId; at: number }>) {
        state.drawer = action.payload.id;
        state.selectedJobId = null;
        if (action.payload.id === "alerts") state.alertsReadAt = action.payload.at;
      },
      prepare: (id: DrawerId) => ({ payload: { id, at: Date.now() } }),
    },
    drawerClosed(state) {
      state.drawer = null;
      state.selectedJobId = null;
    },
    shortcutsToggled(state, action: PayloadAction<boolean | undefined>) {
      state.shortcutsOpen = action.payload ?? !state.shortcutsOpen;
    },
    themeToggled(state) {
      state.theme = state.theme === "dark" ? "light" : "dark";
    },
    themeSet(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    demoModeToggled(state) {
      state.demoMode = !state.demoMode;
    },
    pauseToggled(state) {
      state.paused = !state.paused;
    },
    zonesToggled(state) {
      state.showZones = !state.showZones;
    },
    driverFocused(state, action: PayloadAction<string | null>) {
      state.focusedDriverId = action.payload;
    },
    toastShown(state, action: PayloadAction<{ tone: ToastTone; text: string }>) {
      state.toasts.push({ id: state.nextToastId, ...action.payload });
      state.nextToastId += 1;
      if (state.toasts.length > 4) state.toasts.shift();
    },
    toastDismissed(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(seeded, (state) => {
      state.selectedJobId = null;
      state.drawer = null;
      state.alertsReadAt = 0;
    });
  },
});

export const {
  tabChanged,
  sortToggled,
  windowChanged,
  filterToggled,
  gridQueryChanged,
  jobSelected,
  drawerOpened,
  drawerClosed,
  shortcutsToggled,
  themeToggled,
  themeSet,
  demoModeToggled,
  pauseToggled,
  zonesToggled,
  driverFocused,
  toastShown,
  toastDismissed,
} = uiSlice.actions;
export default uiSlice.reducer;
