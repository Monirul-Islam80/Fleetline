"use client";

import { memo, useEffect, useState } from "react";
import { APP } from "@/config/app";
import { focusTarget } from "@/lib/focusRegistry";
import { cx } from "@/lib/cx";
import { formatFleetTime, formatLocalTime } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectDriverLists, selectFlaggedZones, selectUnreadStaff } from "@/store/selectors";
import { panelToggled, toastShown, viewChanged, type PanelId, type View } from "@/store/slices/uiSlice";
import { loadSnapshot } from "@/store/thunks/inbox";
import { Icon, type IconName } from "../ui/Icon";
import s from "./shell.module.css";

function useSoon() {
  const dispatch = useAppDispatch();
  return (what: string) => () => dispatch(toastShown({ tone: "info", text: `${what} is planned for a later phase` }));
}

const openTab = (path: string) => () => window.open(path, "_blank", "noopener");

/* ---------- Row 1 ---------- */

function Identity() {
  return (
    <div className={s.identity}>
      <span>
        <b>{APP.operator.name}</b> @ {APP.fleetName} EXT: {APP.operator.extension}
      </span>
      <span className={s.signal} aria-label="Connection good">
        {[5, 8, 11, 14, 16].map((h) => (
          <i key={h} style={{ height: h }} />
        ))}
      </span>
    </div>
  );
}

interface ToolIcon {
  icon: IconName;
  label: string;
  run: () => void;
}

export function TopBar({ module = "operator" }: { module?: "operator" }) {
  const dispatch = useAppDispatch();
  const soon = useSoon();
  const tools: ToolIcon[] = [
    { icon: "chart", label: "Wallboard", run: openTab("/wallboard") },
    { icon: "grid", label: "Overview", run: soon("Overview") },
    { icon: "map", label: "Driver playback", run: openTab("/playback") },
    { icon: "car", label: "Parking", run: openTab("/parking") },
    { icon: "doc", label: "Data suite", run: soon("Data suite") },
    { icon: "search", label: "Booking search (F6)", run: () => focusTarget("search") },
    { icon: "wrench", label: "Settings", run: () => dispatch(panelToggled("settings")) },
    { icon: "refresh", label: "Refresh local data", run: () => void dispatch(loadSnapshot()) },
    { icon: "chat", label: "Contact support", run: soon("Support") },
  ];
  return (
    <header className={s.top}>
      <Identity />
      <span className={s.spacer} />
      <nav className={s.moduleTabs} aria-label="Modules">
        <button type="button" className={s.moduleTab} aria-current={module === "operator" ? "page" : undefined}>
          <Icon name="phone" size={16} /> Operator
        </button>
        <button type="button" className={s.moduleTab} onClick={soon("Manage")}>
          <Icon name="list" size={16} /> Manage
        </button>
        <button type="button" className={s.moduleTab} onClick={soon("Admin")}>
          <Icon name="gear" size={16} /> Admin
        </button>
        <button type="button" className={cx(s.moduleTab, s.whatsNew)} onClick={soon("What's new")}>
          What&apos;s new <Icon name="megaphone" size={17} />
        </button>
        {tools.map((t) => (
          <button key={t.label} type="button" className={s.iconTab} title={t.label} aria-label={t.label} onClick={t.run}>
            <Icon name={t.icon} size={19} />
          </button>
        ))}
        <button type="button" className={s.logout} title="Log out" aria-label="Log out" onClick={soon("Sign-in")}>
          <Icon name="close" size={19} />
        </button>
      </nav>
    </header>
  );
}

/* ---------- Row 2 ---------- */

/** Operator's local time, then fleet (UK) time in red, as remote teams expect. */
const Clocks = memo(function Clocks() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={s.clock} title="Your time, then fleet time (UK)">
      <span suppressHydrationWarning>{formatLocalTime(now)}</span> <em suppressHydrationWarning>{formatFleetTime(now)}</em>
    </span>
  );
});

const VIEWS: readonly { id: View; label: string }[] = [
  { id: "dispatch", label: "Dispatch" },
  { id: "bookings", label: "Bookings" },
  { id: "drivers", label: "Drivers" },
  { id: "logs", label: "Logs" },
];

interface CounterTab {
  id: PanelId;
  label: string;
  count?: number;
  /** Turns the tab orange while something is waiting. */
  urgent?: boolean;
}

function useCounters(): CounterTab[] {
  const inbox = useAppSelector((st) => st.inbox);
  const unreadStaff = useAppSelector(selectUnreadStaff);
  const inactive = useAppSelector(selectDriverLists).away.length;
  const zones = useAppSelector(selectFlaggedZones).length;
  return [
    { id: "staff", label: "Staff messages", urgent: unreadStaff > 0 },
    { id: "zones", label: "Clear zones", count: zones },
    { id: "inactive", label: "Driver inactive", count: inactive },
    { id: "calls", label: "Call queue", count: inbox.callQueue.length, urgent: inbox.callQueue.length > 0 },
    { id: "chat", label: "Driver chat", count: inbox.driverChats.length, urgent: inbox.driverChats.length > 0 },
    { id: "broadcast", label: "Messages" },
    { id: "alerts", label: "Alerts", count: inbox.alerts.length, urgent: inbox.alerts.length > 0 },
    { id: "flights", label: "Flight alerts" },
  ];
}

export function SubBar() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((st) => st.ui.view);
  const panel = useAppSelector((st) => st.ui.panel);
  const counters = useCounters();
  return (
    <div className={s.sub}>
      <nav style={{ display: "flex", gap: 3 }} aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={s.tab} aria-current={view === v.id ? "page" : undefined} onClick={() => dispatch(viewChanged(v.id))}>
            {v.label}
          </button>
        ))}
        <button type="button" className={s.tab} title="Open in a new window" aria-label="Open in a new window" onClick={openTab("/")}>
          <Icon name="expand" size={17} />
        </button>
      </nav>
      <button type="button" className={s.sitesBtn} aria-expanded={panel === "sites"} onClick={() => dispatch(panelToggled("sites"))}>
        <Icon name="filter" size={12} /> Sites
      </button>
      <Clocks />
      <div className={s.counters}>
        {counters.map((c) => (
          <button key={c.id} type="button" className={cx(s.tab, c.urgent && s.waiting)} aria-expanded={panel === c.id} onClick={() => dispatch(panelToggled(c.id))}>
            {c.label}
            {c.count !== undefined && ` (${c.count})`}
          </button>
        ))}
      </div>
    </div>
  );
}
