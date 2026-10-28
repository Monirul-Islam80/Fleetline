import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { SITES } from "@/config/app";
import type { JobTab } from "@/config/status";
import { seeded } from "../actions";

export type View = "dispatch" | "bookings" | "drivers" | "logs";
/** Pop-over panels opened from the bar under the header. */
export type PanelId = "staff" | "zones" | "inactive" | "calls" | "chat" | "broadcast" | "alerts" | "flights" | "sites" | "settings";
export type ModalId = "via" | "options";
export type SortKey = "time" | "priority" | "status" | "pickup" | "dropoff" | "name" | "zone";
export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

export interface UiState {
  view: View;
  tab: JobTab;
  sort: { key: SortKey; dir: "asc" | "desc" };
  windowHours: number;
  filters: { recurring: boolean; tickets: boolean; groups: boolean };
  hideZoneCols: boolean;
  siteIds: string[];
  selectedJobId: string | null;
  panel: PanelId | null;
  modal: ModalId | null;
  /** The extra booking fields panel that takes the map's place. */
  showExtras: boolean;
  showZones: boolean;
  mapQuery: string;
  focusedDriverId: string | null;
  /** Callsign pre-filled in the driver message panel by a Reply or Enquiry button. */
  replyTo: string;
  demoFeed: boolean;
  paused: boolean;
  toasts: Toast[];
  nextToastId: number;
}

const initialState: UiState = {
  view: "dispatch",
  tab: "dispatch",
  sort: { key: "time", dir: "asc" },
  windowHours: 4,
  filters: { recurring: true, tickets: true, groups: true },
  hideZoneCols: false,
  siteIds: SITES.map((s) => s.id),
  selectedJobId: null,
  panel: null,
  modal: null,
  showExtras: false,
  showZones: false,
  mapQuery: "",
  focusedDriverId: null,
  replyTo: "",
  demoFeed: true,
  paused: false,
  toasts: [],
  nextToastId: 1,
};

type Filter = keyof UiState["filters"];

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    viewChanged(state, action: PayloadAction<View>) {
      state.view = action.payload;
      state.panel = null;
    },
    tabChanged(state, action: PayloadAction<JobTab>) {
      state.tab = action.payload;
    },
    sortToggled(state, action: PayloadAction<SortKey>) {
      const same = state.sort.key === action.payload;
      state.sort = { key: action.payload, dir: same && state.sort.dir === "asc" ? "desc" : "asc" };
    },
    windowChanged(state, action: PayloadAction<number>) {
      state.windowHours = action.payload;
    },
    filterToggled(state, action: PayloadAction<Filter>) {
      state.filters[action.payload] = !state.filters[action.payload];
    },
    zoneColsToggled(state) {
      state.hideZoneCols = !state.hideZoneCols;
    },
    sitesChanged(state, action: PayloadAction<string[]>) {
      state.siteIds = action.payload;
    },
    jobSelected(state, action: PayloadAction<string | null>) {
      state.selectedJobId = state.selectedJobId === action.payload ? null : action.payload;
    },
    panelToggled(state, action: PayloadAction<PanelId>) {
      state.panel = state.panel === action.payload ? null : action.payload;
      state.replyTo = "";
    },
    replyStarted(state, action: PayloadAction<string>) {
      state.replyTo = action.payload;
      state.panel = "broadcast";
    },
    modalOpened(state, action: PayloadAction<ModalId | null>) {
      state.modal = action.payload;
    },
    extrasToggled(state) {
      state.showExtras = !state.showExtras;
    },
    zonesToggled(state) {
      state.showZones = !state.showZones;
    },
    mapQueryChanged(state, action: PayloadAction<string>) {
      state.mapQuery = action.payload;
    },
    driverFocused(state, action: PayloadAction<string | null>) {
      state.focusedDriverId = action.payload;
    },
    demoFeedToggled(state) {
      state.demoFeed = !state.demoFeed;
    },
    pauseToggled(state) {
      state.paused = !state.paused;
    },
    /** Esc: closes the top-most layer only. */
    escaped(state) {
      if (state.modal) state.modal = null;
      else if (state.panel) state.panel = null;
      else if (state.selectedJobId) state.selectedJobId = null;
    },
    toastShown(state, action: PayloadAction<{ tone: ToastTone; text: string }>) {
      state.toasts.push({ id: state.nextToastId, ...action.payload });
      state.nextToastId += 1;
      if (state.toasts.length > 3) state.toasts.shift();
    },
    toastDismissed(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(seeded, (state) => {
      state.selectedJobId = null;
      state.panel = null;
      state.modal = null;
    });
  },
});

export const {
  viewChanged,
  tabChanged,
  sortToggled,
  windowChanged,
  filterToggled,
  zoneColsToggled,
  sitesChanged,
  jobSelected,
  panelToggled,
  replyStarted,
  modalOpened,
  extrasToggled,
  zonesToggled,
  mapQueryChanged,
  driverFocused,
  demoFeedToggled,
  pauseToggled,
  escaped,
  toastShown,
  toastDismissed,
} = uiSlice.actions;
export default uiSlice.reducer;
