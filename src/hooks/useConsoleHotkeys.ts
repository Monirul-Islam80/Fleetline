"use client";

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { DOUBLE_PRESS_MS, KEYMAP } from "@/config/keymap";
import { focusTarget, type FocusTarget } from "@/lib/focusRegistry";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { formReset, tariffSelected } from "@/store/slices/bookingSlice";
import { escaped, modalOpened, toastShown } from "@/store/slices/uiSlice";
import { saveBooking } from "@/store/thunks/booking";

/** Shortcuts fire while typing in any field: that is the point for call-takers. */
const OPTIONS = { enableOnFormTags: true, preventDefault: true } as const;

/** Last two key presses, so "double F2" means F2 twice with nothing in between. */
const history = { prevKey: "", prevAt: 0, key: "", at: 0 };
function trackKey(e: KeyboardEvent): void {
  Object.assign(history, { prevKey: history.key, prevAt: history.at, key: e.key, at: performance.now() });
}

function useDoublePress(keys: string, first: FocusTarget, second: FocusTarget): void {
  useHotkeys(
    keys,
    () => {
      const isDouble = history.prevKey === history.key && history.at - history.prevAt < DOUBLE_PRESS_MS;
      if (isDouble) history.key = ""; // a third press starts over
      focusTarget(isDouble ? second : first);
    },
    OPTIONS,
  );
}

/** Global keyboard map for the dispatch screen. Keys come from config/keymap.ts. */
export function useConsoleHotkeys(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    window.addEventListener("keydown", trackKey, { capture: true });
    return () => window.removeEventListener("keydown", trackKey, { capture: true });
  }, []);

  // F1 saves the job, or closes the via list first when it is open (its button reads "Save & close [F1]").
  useHotkeys(
    KEYMAP.save.keys,
    () => {
      const { modal } = store.getState().ui;
      if (modal === "via") dispatch(modalOpened(null));
      else if (!modal) void dispatch(saveBooking());
    },
    OPTIONS,
  );
  useDoublePress(KEYMAP.pickup.keys, "pickup", "dropoff");
  useDoublePress(KEYMAP.name.keys, "name", "phone");
  useHotkeys(KEYMAP.search.keys, () => focusTarget("search"), OPTIONS);
  useHotkeys(KEYMAP.via.keys, () => dispatch(modalOpened("via")), OPTIONS);
  useHotkeys(KEYMAP.lead.keys, () => focusTarget("lead"), OPTIONS);
  useHotkeys(KEYMAP.clear.keys, () => {
    dispatch(formReset());
  }, OPTIONS);
  useHotkeys(KEYMAP.recurring.keys, () => dispatch(toastShown({ tone: "info", text: "Recurring bookings are planned for the next phase" })), OPTIONS);
  useHotkeys(KEYMAP.tariff1.keys, () => dispatch(tariffSelected("standard")), OPTIONS);
  useHotkeys(KEYMAP.tariff2.keys, () => dispatch(tariffSelected("large")), OPTIONS);
  useHotkeys(KEYMAP.tariff3.keys, () => dispatch(tariffSelected("exec")), OPTIONS);
  useHotkeys(KEYMAP.close.keys, () => dispatch(escaped()), { enableOnFormTags: true });
}
