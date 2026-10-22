"use client";

import { useEffect } from "react";
import { SIM } from "@/config/app";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createDemoBooking, resetDemo, simulationTick } from "@/store/thunks/simulation";

/**
 * Seeds data on mount (client only, so server and client HTML never disagree about the time)
 * and drives the placeholder engine. Replace with a socket subscription when the API exists.
 */
export function useSimulation(): void {
  const dispatch = useAppDispatch();
  const paused = useAppSelector((s) => s.ui.paused);
  const demoMode = useAppSelector((s) => s.ui.demoMode);

  useEffect(() => {
    dispatch(resetDemo());
  }, [dispatch]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      // Skip work while the tab is hidden; the next tick catches up.
      if (document.visibilityState === "visible") dispatch(simulationTick());
    }, SIM.tickMs);
    return () => window.clearInterval(id);
  }, [dispatch, paused]);

  useEffect(() => {
    if (!demoMode || paused) return;
    dispatch(createDemoBooking());
    const id = window.setInterval(() => dispatch(createDemoBooking()), SIM.demoBookingEveryMs);
    return () => window.clearInterval(id);
  }, [dispatch, demoMode, paused]);
}
