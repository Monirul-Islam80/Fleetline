"use client";

import { useConsoleHotkeys } from "@/hooks/useConsoleHotkeys";
import { useAppSelector } from "@/store/hooks";
import type { View } from "@/store/slices/uiSlice";
import { DispatchView } from "../dispatch/DispatchView";
import { Panels } from "../panels/Panels";
import { Toasts } from "../ui/overlays";
import { BookingsView } from "../views/BookingsView";
import { DriversView } from "../views/DriversView";
import { LogsView } from "../views/LogsView";
import { SubBar, TopBar } from "./Header";
import s from "./shell.module.css";

const VIEWS: Record<View, () => React.ReactNode> = {
  dispatch: () => <DispatchView />,
  bookings: () => <BookingsView />,
  drivers: () => <DriversView />,
  logs: () => <LogsView />,
};

/** The operator screen: header rows, the active view, and the panels the counter tabs open. */
export function OperatorConsole() {
  useConsoleHotkeys();
  const ready = useAppSelector((st) => st.fleet.ready);
  const view = useAppSelector((st) => st.ui.view);
  return (
    <div className={s.shell}>
      <TopBar />
      <SubBar />
      <main className={s.main}>
        {ready ? VIEWS[view]() : <p style={{ margin: "auto", color: "var(--text-3)" }}>Loading the board…</p>}
        <div className={s.panelLayer}>
          <Panels />
        </div>
      </main>
      <Toasts />
    </div>
  );
}
