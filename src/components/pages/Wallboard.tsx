"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { UNASSIGNED } from "@/config/status";
import { useTileLayout } from "@/hooks/useTileLayout";
import { createRandom } from "@/lib/random";
import { fleetDayRange } from "@/lib/time";
import { useAppSelector } from "@/store/hooks";
import { selectAllJobs, selectDriverLists, selectNowMinute } from "@/store/selectors";
import type { Job } from "@/types/domain";
import { Icon } from "../ui/Icon";
import s from "./pages.module.css";

const HALF_HOUR = 30 * 60_000;

/** Bookings per half hour since midnight. Last week is placeholder until the reports API exists. */
function useBookingSeries(jobs: Job[], now: number) {
  return useMemo(() => {
    const start = fleetDayRange(now, now)?.start ?? now;
    const buckets = Math.max(2, Math.ceil((now - start) / HALF_HOUR));
    const today = Array.from({ length: buckets }, () => 0);
    for (const j of jobs) {
      const i = Math.floor((j.createdAt - start) / HALF_HOUR);
      if (i >= 0 && i < buckets) today[i] = (today[i] ?? 0) + 1;
    }
    const rand = createRandom(7);
    const lastWeek = Array.from({ length: 48 }, (_, i) => Math.round(2 + 10 * Math.sin((i / 48) * Math.PI) ** 2 + rand() * 4));
    return { today, lastWeek, start };
  }, [jobs, now]);
}

function Chart({ today, lastWeek }: { today: number[]; lastWeek: number[] }) {
  const W = 560;
  const H = 260;
  const max = Math.max(4, ...today, ...lastWeek);
  const x = (i: number) => 30 + (i / 47) * (W - 40);
  const y = (v: number) => H - 24 - (v / max) * (H - 40);
  const line = (data: number[]) => data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line(lastWeek)}L${x(lastWeek.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bookings per half hour, today and last week">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={30} x2={W - 10} y1={y(t)} y2={y(t)} stroke="#273142" />
          <text x={4} y={y(t) + 4} fill="#8b97aa" fontSize={12}>
            {t}
          </text>
        </g>
      ))}
      <path d={area} fill="#3b4556" opacity={0.6} />
      <path d={line(today)} fill="none" stroke="#4ade80" strokeWidth={2.5} />
      {[0, 12, 24, 36, 47].map((i) => (
        <text key={i} x={x(i)} y={H - 6} fill="#c6cfdb" fontSize={12} textAnchor="middle">
          {`${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`}
        </text>
      ))}
    </svg>
  );
}

function Metric({ value, sub, accent, bar }: { value: string | number; sub: string; accent?: boolean; bar?: string }) {
  return (
    <>
      <span className={`${s.value} ${accent ? s.good : ""}`} style={bar ? ({ "--bar-colour": bar } as CSSProperties) : undefined}>
        {value}
      </span>
      <span className={s.sub}>{sub}</span>
    </>
  );
}

interface TileDef {
  title: ReactNode;
  body: ReactNode;
  className?: string;
  accent?: boolean;
}

const STORAGE_KEY = "fleetline.wallboard.layout";

/** Wall screen KPIs. Drag a tile by its header to move it; the layout is remembered on this screen. */
export function Wallboard() {
  const jobs = useAppSelector(selectAllJobs);
  const lists = useAppSelector(selectDriverLists);
  const operators = useAppSelector((st) => st.inbox.operators);
  const total = useAppSelector((st) => st.fleet.drivers.ids.length);
  const now = useAppSelector(selectNowMinute);
  const series = useBookingSeries(jobs, now);

  const today = jobs.filter((j) => j.createdAt >= series.start);
  const count = (pred: (j: Job) => boolean) => jobs.filter(pred).length;
  const bySource = (src: Job["source"]) => today.filter((j) => j.source === src).length;
  const automated = today.length ? Math.round(((bySource("APP") + bySource("WEB")) / today.length) * 1000) / 10 : 0;
  const available = lists.parked.length + lists.bidding.length;

  /** Every tile on the board, keyed by a stable id. The key order is the default layout. */
  const tiles: Record<string, TileDef> = {
    operators: {
      title: `Operators ${operators.length}`,
      className: s.operators,
      body: (
        <>
          <ul className={s.opList}>
            {operators.map((o) => (
              <li key={o.id}>
                <span className={o.online ? s.online : s.offline} /> {o.name} <b>{o.bookingsLastHour}</b>
              </li>
            ))}
          </ul>
          <span className={s.sub}>Bookings last hour</span>
        </>
      ),
    },
    online: { title: "Drivers online", body: <Metric value={lists.online.length} sub={`${total} total drivers`} /> },
    available: { title: "Drivers available", accent: true, body: <Metric value={available} sub="Now" accent /> },
    chart: {
      title: (
        <>
          Bookings
          <span className={s.legend}>
            <span style={{ "--c": "#64748b" } as CSSProperties}>Last week</span>
            <span style={{ "--c": "#4ade80" } as CSSProperties}>Today</span>
          </span>
        </>
      ),
      className: s.chartTile,
      body: <Chart today={series.today} lastWeek={series.lastWeek} />,
    },
    booked: { title: "Drivers booked", body: <Metric value={lists.online.length - available} sub="Now" /> },
    dispatching: { title: "Bookings dispatching", body: <Metric value={count((j) => j.status === "NEW" || j.status === "BIDDING")} sub="Now" bar="#ef4444" /> },
    late: { title: "Late bookings", body: <Metric value={count((j) => UNASSIGNED.has(j.status) && j.pickupAt < now)} sub="Now" /> },
    prebooked: { title: "Prebookings", body: <Metric value={count((j) => j.status === "BOOKED")} sub="Now" /> },
    completed: { title: "Bookings completed", body: <Metric value={count((j) => j.status === "COMPLETED")} sub="Today" /> },
    cancelled: { title: "Bookings cancelled", body: <Metric value={count((j) => j.status === "CANCELLED")} sub="Today" /> },
    noshow: { title: "Bookings no show", body: <Metric value={count((j) => j.status === "NOSHOW")} sub="Today" /> },
    phone: { title: "Dispatch bookings", body: <Metric value={bySource("PHONE")} sub="Today" /> },
    web: { title: "Web bookings", body: <Metric value={bySource("WEB")} sub="Today" /> },
    app: { title: "App bookings", body: <Metric value={bySource("APP")} sub="Today" /> },
    ivr: { title: "IVR bookings", body: <Metric value={0} sub="Today" /> },
    automation: { title: "Automation", accent: true, body: <Metric value={`${automated}%`} sub="IVR, app, web today" accent /> },
    avgDispatch: { title: "Avg dispatch time", body: <Metric value="2m 3s" sub="Last hour (placeholder)" bar="#ef4444" /> },
    avgPickup: { title: "Avg pickup time", body: <Metric value="8m 4s" sub="Last hour (placeholder)" bar="#ef4444" /> },
    avgPob: { title: "Avg POB time", body: <Metric value="3m 24s" sub="Last hour (placeholder)" bar="#ef4444" /> },
  };

  const ids = Object.keys(tiles);
  const layout = useTileLayout(ids, STORAGE_KEY);

  return (
    <div className={s.wallboardPage}>
      <div className={s.wallboardBar}>
        <span>Drag a tile by its header to move it. Your layout is saved on this screen.</span>
        {layout.hidden.length > 0 && <span>{layout.hidden.length} hidden</span>}
        <button type="button" className={s.resetBtn} onClick={layout.reset}>
          <Icon name="refresh" size={14} /> Reset layout
        </button>
      </div>
      <div className={s.wallboard}>
        {layout.visible.map((id) => {
          const tile = tiles[id];
          if (!tile) return null;
          return (
            <div key={id} className={`${s.tile} ${tile.accent ? s.tileAccent : ""} ${tile.className ?? ""}`} {...layout.tileProps(id)}>
              <div className={s.tileHead}>
                <span className={s.tileTitle}>{tile.title}</span>
                <span className={s.tileTools}>
                  <button type="button" className={s.grip} aria-label={`Move ${id} tile (arrow keys)`} title="Drag to move" {...layout.handleProps(id)}>
                    <Icon name="grip" size={15} strokeWidth={3} />
                  </button>
                  <button type="button" aria-label={`Hide ${id} tile`} title="Hide" onClick={() => layout.hide(id)}>
                    <Icon name="x" size={13} />
                  </button>
                </span>
              </div>
              {tile.body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
