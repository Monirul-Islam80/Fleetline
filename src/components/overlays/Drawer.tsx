"use client";

import type { ReactNode } from "react";
import { DRIVER_STATUS } from "@/config/status";
import { formatDuration, formatFleetTime } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAlerts, selectAllDrivers, selectDriverLists, selectFlaggedZones, selectTabBuckets } from "@/store/selectors";
import { commsCleared } from "@/store/slices/commsSlice";
import { zoneFlagsCleared } from "@/store/slices/fleetSlice";
import { driverFocused, jobSelected, type DrawerId } from "@/store/slices/uiSlice";
import { Button, CallsignChip, Empty } from "../ui/primitives";
import { DrawerShell } from "./DrawerShell";
import { JobDrawer } from "./JobDrawer";
import s from "./overlays.module.css";

interface Row {
  key: string;
  main: ReactNode;
  sub?: ReactNode;
  side?: ReactNode;
  onClick?: () => void;
}

function RowList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <ul className={s.list}>
      {rows.map((r) => (
        <li key={r.key} className={s.listItem} onClick={r.onClick} style={r.onClick ? { cursor: "pointer" } : undefined}>
          <span className={s.listMain}>
            {r.main}
            {r.sub && <span className={s.listSub}>{r.sub}</span>}
          </span>
          {r.side}
        </li>
      ))}
    </ul>
  );
}

const PLACEHOLDER_NOTE = "Placeholder content. This list connects to telephony and chat in a later phase.";

/** Fake but stable rows so the counter drawers look real during a pitch. */
const placeholderRows = (count: number, make: (i: number) => Row): Row[] => Array.from({ length: count }, (_, i) => make(i));

function AlertsView() {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectAlerts);
  const numbers = useAppSelector((st) => st.jobs.entities);
  return (
    <DrawerShell title="Alerts">
      <RowList
        empty="No alerts. Missed offers and no-shows will show here."
        rows={alerts.slice(0, 60).map((a) => ({
          key: a.id,
          main: a.text,
          sub: `Job ${numbers[a.jobId]?.number ?? ""}`,
          side: <time>{formatFleetTime(a.at)}</time>,
          onClick: () => dispatch(jobSelected(a.jobId)),
        }))}
      />
    </DrawerShell>
  );
}

function FlightsView() {
  const dispatch = useAppDispatch();
  const flights = useAppSelector((st) => selectTabBuckets(st).flights);
  return (
    <DrawerShell title="Airport pickups">
      <p className={s.note}>Flight status is simulated. Live tracking plugs in during phase 3.</p>
      <RowList
        empty="No airport pickups in the window"
        rows={flights.map((j) => ({
          key: j.id,
          main: `${j.flightNo ?? ""} for ${j.customerName}`,
          sub: `${j.pickup.label}, job ${j.number}`,
          side: (
            <span style={{ color: j.number % 3 === 0 ? "var(--tone-waiting)" : "var(--tone-free)", fontWeight: 600, fontSize: 12 }}>
              {j.number % 3 === 0 ? "Delayed 25 min" : "On time"}
            </span>
          ),
          onClick: () => dispatch(jobSelected(j.id)),
        }))}
      />
    </DrawerShell>
  );
}

function InactiveView() {
  const dispatch = useAppDispatch();
  const away = useAppSelector(selectDriverLists).away;
  const now = useAppSelector((st) => st.fleet.now);
  return (
    <DrawerShell title="Drivers away">
      <RowList
        empty="Every driver is active"
        rows={away.map((d) => ({
          key: d.id,
          main: (
            <>
              <CallsignChip callsign={d.callsign} status={d.status} /> {d.name}
            </>
          ),
          sub: `${DRIVER_STATUS[d.status].label} for ${formatDuration(now - d.statusSince)}, last seen near ${zoneName(d.zoneId)}`,
          onClick: () => dispatch(driverFocused(d.id)),
        }))}
      />
    </DrawerShell>
  );
}

function ZonesView() {
  const dispatch = useAppDispatch();
  const zones = useAppSelector(selectFlaggedZones);
  return (
    <DrawerShell
      title="Flagged zones"
      footer={
        <Button variant="danger" icon="x" disabled={!zones.length} onClick={() => dispatch(zoneFlagsCleared())}>
          Clear all flags
        </Button>
      }
    >
      <RowList
        empty="No zones are surging or fully booked"
        rows={zones.map((z) => ({ key: z.id, main: z.name, sub: [z.surge && "Surge pricing", z.fullyBooked && "Fully booked"].filter(Boolean).join(", ") }))}
      />
    </DrawerShell>
  );
}

function CommsView({ id }: { id: "calls" | "chat" | "messages" | "staff" }) {
  const dispatch = useAppDispatch();
  const comms = useAppSelector((st) => st.comms);
  const callsigns = useAppSelector(selectAllDrivers).slice(0, 12).map((d) => d.callsign);
  const config = {
    calls: { title: "Call queue", key: "callQueue", make: (i: number): Row => ({ key: `c${i}`, main: `07700 900${String(310 + i * 17).slice(-3)}`, sub: i % 2 ? "Known caller" : "New caller", side: <time>{`0:${String(12 + i * 9).padStart(2, "0")}`}</time> }) },
    chat: { title: "Driver chat", key: "driverChat", make: (i: number): Row => ({ key: `d${i}`, main: `${callsigns[i % callsigns.length] ?? ""}: ${["Traffic on the A22, 5 min late", "Passenger asking for a receipt", "Fuel stop after this job", "Can I take a break at 6?"][i % 4]}`, side: <time>{`${2 + i} min`}</time> }) },
    messages: { title: "Messages", key: "messages", make: (i: number): Row => ({ key: `m${i}`, main: ["Account customer asked for a call back", "Lost property: umbrella in car 212"][i % 2] ?? "", side: <time>{`${8 + i} min`}</time> }) },
    staff: { title: "Staff messages", key: "staffMessages", make: (i: number): Row => ({ key: `s${i}`, main: "Shift swap request for Sunday", side: <time>{`${20 + i} min`}</time> }) },
  } as const;
  const view = config[id];
  const count = comms[view.key];
  return (
    <DrawerShell
      title={view.title}
      footer={
        <Button disabled={!count} onClick={() => dispatch(commsCleared(view.key))}>
          Mark all handled
        </Button>
      }
    >
      <p className={s.note}>{PLACEHOLDER_NOTE}</p>
      <RowList empty="Nothing waiting" rows={placeholderRows(count, view.make)} />
    </DrawerShell>
  );
}

const VIEWS: Record<Exclude<DrawerId, "job">, () => ReactNode> = {
  alerts: () => <AlertsView />,
  flights: () => <FlightsView />,
  inactive: () => <InactiveView />,
  zones: () => <ZonesView />,
  calls: () => <CommsView id="calls" />,
  chat: () => <CommsView id="chat" />,
  messages: () => <CommsView id="messages" />,
  staff: () => <CommsView id="staff" />,
};

export function Drawer() {
  const drawer = useAppSelector((st) => st.ui.drawer);
  const jobId = useAppSelector((st) => st.ui.selectedJobId);
  if (!drawer) return null;
  if (drawer === "job") return jobId ? <JobDrawer jobId={jobId} /> : null;
  return VIEWS[drawer]();
}
