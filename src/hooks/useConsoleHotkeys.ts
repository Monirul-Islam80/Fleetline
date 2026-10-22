"use client";

import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { DOUBLE_PRESS_MS, KEYMAP } from "@/config/keymap";
import { focusTarget, type FocusTarget } from "@/lib/focusRegistry";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { formReset, tariffSelected } from "@/store/slices/bookingSlice";
import { drawerClosed, shortcutsToggled, toastShown } from "@/store/slices/uiSlice";
import { saveBooking } from "@/store/thunks/booking";
import type { TariffId } from "@/types/domain";

/** Shortcuts work while typing in any field, which is the whole point for call-takers. */
const OPTIONS = { enableOnFormTags: true, preventDefault: true } as const;

/**
 * Remembers the previous key press so a "double press" means the same key twice in a row,
 * with nothing typed in between. Registered in the capture phase so it runs before handlers.
 */
const keyHistory = { prevKey: "", prevAt: 0, key: "", at: 0 };

function trackKey(e: KeyboardEvent): void {
  keyHistory.prevKey = keyHistory.key;
  keyHistory.prevAt = keyHistory.at;
  keyHistory.key = e.key;
  keyHistory.at = performance.now();
}

/** Single press focuses `first`; the same key again straight away focuses `second`. */
function useDoublePress(keys: string, first: FocusTarget, second: FocusTarget): void {
  useHotkeys(
    keys,
    () => {
      const isDouble = keyHistory.prevKey === keyHistory.key && keyHistory.at - keyHistory.prevAt < DOUBLE_PRESS_MS;
      // A third press starts over instead of counting as another double.
      if (isDouble) keyHistory.key = "";
      focusTarget(isDouble ? second : first);
    },
    OPTIONS,
  );
}

export function useConsoleHotkeys(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    window.addEventListener("keydown", trackKey, { capture: true });
    return () => window.removeEventListener("keydown", trackKey, { capture: true });
  }, []);

  useHotkeys(
    KEYMAP.save.keys,
    () => {
      if (dispatch(saveBooking())) focusTarget("phone");
    },
    OPTIONS,
  );
  useDoublePress(KEYMAP.pickup.keys, "pickup", "dropoff");
  useDoublePress(KEYMAP.name.keys, "name", "phone");
  useHotkeys(KEYMAP.search.keys, () => focusTarget("search"), OPTIONS);
  useHotkeys(KEYMAP.via.keys, () => focusTarget("via"), OPTIONS);
  useHotkeys(KEYMAP.lead.keys, () => focusTarget("lead"), OPTIONS);
  useHotkeys(
    KEYMAP.clear.keys,
    () => {
      dispatch(formReset());
      focusTarget("phone");
    },
    OPTIONS,
  );
  useHotkeys(
    KEYMAP.recurring.keys,
    () => dispatch(toastShown({ tone: "info", text: "Recurring bookings arrive in phase 2" })),
    OPTIONS,
  );

  const pickTariff = (id: TariffId) => () => dispatch(tariffSelected(id));
  useHotkeys(KEYMAP.tariff1.keys, pickTariff("standard"), OPTIONS);
  useHotkeys(KEYMAP.tariff2.keys, pickTariff("large"), OPTIONS);
  useHotkeys(KEYMAP.tariff3.keys, pickTariff("exec"), OPTIONS);

  useHotkeys(
    KEYMAP.close.keys,
    () => {
      const { ui } = store.getState();
      if (ui.shortcutsOpen) dispatch(shortcutsToggled(false));
      else if (ui.drawer) dispatch(drawerClosed());
    },
    { enableOnFormTags: true },
  );
  // "?" only outside inputs, so typing a question mark in notes still works.
  useHotkeys(KEYMAP.help.keys, () => dispatch(shortcutsToggled()), { preventDefault: true, useKey: false });
}
