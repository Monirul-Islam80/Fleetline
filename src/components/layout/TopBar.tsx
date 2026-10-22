"use client";

import { memo } from "react";
import { APP } from "@/config/app";
import { cx } from "@/lib/cx";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectFlaggedZones, selectFleetStats, selectTabBuckets, selectUnreadAlertCount } from "@/store/selectors";
import {
  demoModeToggled,
  drawerOpened,
  pauseToggled,
  shortcutsToggled,
  themeToggled,
  toastShown,
  type DrawerId,
} from "@/store/slices/uiSlice";
import { resetDemo } from "@/store/thunks/simulation";
import { Icon, type IconName } from "../ui/Icon";
import { Button, Count, StatusDot } from "../ui/primitives";
import { Clock } from "./Clock";
import s from "./topbar.module.css";

const MODULES = ["Operator", "Manage", "Admin"] as const;
const VIEWS = ["Dispatch", "Bookings", "Drivers", "Logs"] as const;

function useNextPhase() {
  const dispatch = useAppDispatch();
  return (what: string) => () => dispatch(toastShown({ tone: "info", text: `${what} is planned for the next phase` }));
}

const Brand = memo(function Brand() {
  return (
    <div className={s.brand}>
      <span className={s.mark} aria-hidden="true">
        <Icon name="route" size={15} strokeWidth={2.4} />
      </span>
      <span className={s.brandText}>
        <span className={s.product}>{APP.product}</span>
        <span className={s.fleet}>{APP.fleetName}</span>
      </span>
    </div>
  );
});

function FleetStats() {
  const stats = useAppSelector(selectFleetStats);
  return (
    <div className={s.stats} aria-label="Fleet status">
      <span className={s.stat}>
        <StatusDot tone="free" /> <b>{stats.free}</b> <span className={s.statLabel}>free</span>
      </span>
      <span className={s.stat}>
        <StatusDot tone="enroute" /> <b>{stats.busy}</b> <span className={s.statLabel}>busy</span>
      </span>
      <span className={s.stat}>
        <StatusDot tone="off" /> <b>{stats.away}</b> <span className={s.statLabel}>away</span>
      </span>
    </div>
  );
}

function ConnectionBadge() {
  const paused = useAppSelector((st) => st.ui.paused);
  return (
    <span className={s.link} style={paused ? { color: "var(--tone-held)" } : undefined} title={paused ? "Live updates paused" : "Live updates connected"}>
      <span className={s.linkBars} aria-hidden="true">
        <i style={{ height: 4 }} />
        <i style={{ height: 7 }} />
        <i style={{ height: 11 }} />
      </span>
      {paused ? "Paused" : "Live"}
    </span>
  );
}

interface CommProps {
  icon: IconName;
  label: string;
  count: number;
  drawer: DrawerId;
  tone?: "waiting" | "alert";
  /** Secondary counters drop their text label on narrow screens and keep icon, count and tooltip. */
  secondary?: boolean;
}

function CommButton({ icon, label, count, drawer, tone, secondary }: CommProps) {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      className={cx(s.comm, count > 0 && tone === "waiting" && s.commWaiting, count > 0 && tone === "alert" && s.commAlert)}
      onClick={() => dispatch(drawerOpened(drawer))}
      title={label}
    >
      <Icon name={icon} size={15} />
      <span className={secondary ? s.secondaryLabel : undefined}>{label}</span>
      <Count value={count} tone={tone === "alert" ? "alert" : tone === "waiting" ? "hot" : undefined} />
    </button>
  );
}

function CommsRow() {
  const dispatch = useAppDispatch();
  const comms = useAppSelector((st) => st.comms);
  const alerts = useAppSelector(selectUnreadAlertCount);
  const away = useAppSelector((st) => selectFleetStats(st).away);
  const zones = useAppSelector(selectFlaggedZones).length;
  const flights = useAppSelector((st) => selectTabBuckets(st).flights);
  const demoMode = useAppSelector((st) => st.ui.demoMode);
  const paused = useAppSelector((st) => st.ui.paused);
  const delayed = flights.filter((j) => j.number % 3 === 0).length;

  return (
    <div className={s.row}>
      <CommButton icon="phone" label="Call queue" count={comms.callQueue} drawer="calls" tone="waiting" />
      <CommButton icon="chat" label="Driver chat" count={comms.driverChat} drawer="chat" tone="waiting" />
      <CommButton icon="message" label="Messages" secondary count={comms.messages} drawer="messages" />
      <CommButton icon="users" label="Staff" secondary count={comms.staffMessages} drawer="staff" />
      <CommButton icon="bell" label="Alerts" count={alerts} drawer="alerts" tone="alert" />
      <button type="button" className={s.comm} onClick={() => dispatch(drawerOpened("flights"))} title="Airport pickups">
        <Icon name="plane" size={15} />
        <span className={s.secondaryLabel}>Flights</span>
        <span className={s.flightCounts} aria-label={`${flights.length - delayed} on time, ${delayed} delayed`}>
          <span data-tone="free">{flights.length - delayed}</span>
          <span data-tone="waiting">{delayed}</span>
        </span>
      </button>
      <CommButton icon="user" label="Drivers away" secondary count={away} drawer="inactive" />
      <CommButton icon="zone" label="Zones flagged" secondary count={zones} drawer="zones" />

      <span className={s.spacer} />

      <div className={s.demo} aria-label="Demo controls">
        <span className={s.demoLabel}>Demo</span>
        <Button size="sm" icon="sparkle" active={demoMode} onClick={() => dispatch(demoModeToggled())}>
          {demoMode ? "Feed on" : "Feed off"}
        </Button>
        <Button size="sm" icon={paused ? "play" : "pause"} onClick={() => dispatch(pauseToggled())}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm" icon="refresh" onClick={() => dispatch(resetDemo())}>
          Reset
        </Button>
      </div>
    </div>
  );
}

export function TopBar() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((st) => st.ui.theme);
  const later = useNextPhase();

  return (
    <header className={s.bar}>
      <div className={s.row}>
        <Brand />
        <nav className={s.nav} aria-label="Modules">
          {MODULES.map((m) => (
            <button key={m} type="button" className={s.navItem} aria-current={m === "Operator" ? "page" : undefined} onClick={m === "Operator" ? undefined : later(m)}>
              {m}
            </button>
          ))}
        </nav>
        <span className={s.divider} />
        <nav className={s.nav} aria-label="Operator views">
          {VIEWS.map((v) => (
            <button key={v} type="button" className={s.navItem} aria-current={v === "Dispatch" ? "page" : undefined} onClick={v === "Dispatch" ? undefined : later(`The ${v} view`)}>
              {v}
            </button>
          ))}
        </nav>

        <span className={s.spacer} />
        <FleetStats />
        <Clock />

        <div className={s.tools}>
          <Button variant="ghost" iconOnly icon="chart" label="Wallboard" onClick={later("Wallboard")} />
          <Button variant="ghost" iconOnly icon="settings" label="Settings" onClick={later("Settings")} />
          <Button variant="ghost" iconOnly icon="keyboard" label="Keyboard shortcuts (?)" onClick={() => dispatch(shortcutsToggled(true))} />
          <Button variant="ghost" iconOnly icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => dispatch(themeToggled())} />
        </div>

        <div className={s.operator}>
          <span className={s.operatorName}>
            {APP.operator.name}
            <span>Ext {APP.operator.extension}</span>
          </span>
          <ConnectionBadge />
          <Button variant="ghost" iconOnly icon="logout" label="Sign out" onClick={later("Sign-in")} />
        </div>
      </div>
      <CommsRow />
    </header>
  );
}
