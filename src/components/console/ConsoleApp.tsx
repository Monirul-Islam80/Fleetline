"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useConsoleHotkeys } from "@/hooks/useConsoleHotkeys";
import { useSimulation } from "@/hooks/useSimulation";
import { useAppSelector } from "@/store/hooks";
import { BookingPanel } from "../booking/BookingPanel";
import { HelperPanel } from "../helper/HelperPanel";
import { JobsPanel } from "../jobs/JobsPanel";
import { TopBar } from "../layout/TopBar";
import { Drawer } from "../overlays/Drawer";
import { ShortcutSheet } from "../overlays/ShortcutSheet";
import { Toasts } from "../overlays/Toasts";
import s from "./console.module.css";
import { StoreProvider } from "./StoreProvider";

// Leaflet touches `window` on import, so the map loads on the client only.
const MapPanel = dynamic(() => import("../map/MapPanel").then((m) => m.MapPanel), { ssr: false });

function useThemeAttribute(): void {
  const theme = useAppSelector((st) => st.ui.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}

function Console() {
  useSimulation();
  useConsoleHotkeys();
  useThemeAttribute();
  const ready = useAppSelector((st) => st.fleet.ready);

  if (!ready) return <div className={s.loading}>Loading the board…</div>;

  return (
    <div className={s.app}>
      <TopBar />
      <main className={s.work}>
        <section className={s.region} aria-label="New booking">
          <BookingPanel />
        </section>
        <section className={s.region} aria-label="Driver availability and fare">
          <HelperPanel />
        </section>
        <section className={s.region} aria-label="Live map">
          <MapPanel />
        </section>
      </main>
      <JobsPanel />
      <Drawer />
      <ShortcutSheet />
      <Toasts />
    </div>
  );
}

export function ConsoleApp() {
  return (
    <StoreProvider>
      <Console />
    </StoreProvider>
  );
}
