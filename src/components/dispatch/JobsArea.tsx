"use client";

import { useMemo, useState } from "react";
import { APP } from "@/config/app";
import { JOB_STATUS, JOB_TABS } from "@/config/status";
import { formatFleetDate, formatFleetTime, formatWeekday } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectDriverEntities, selectNowMinute, selectTabCounts, selectVisibleJobs } from "@/store/selectors";
import { filterToggled, jobSelected, sortToggled, tabChanged, windowChanged, zoneColsToggled, type SortKey } from "@/store/slices/uiSlice";
import { deleteFlight } from "@/store/thunks/inbox";
import type { Flight, Job } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Button, Toggle } from "../ui/controls";
import { DataTable } from "../ui/DataTable";
import { jobColumns, SORTABLE } from "./jobColumns";
import { JobMenu, type MenuState } from "./JobMenu";
import s from "./dispatch.module.css";

function StatusTabs() {
  const dispatch = useAppDispatch();
  const tab = useAppSelector((st) => st.ui.tab);
  const counts = useAppSelector(selectTabCounts);
  return (
    <div className={s.tabs} role="tablist" aria-label="Job lists">
      {JOB_TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={s.tab} onClick={() => dispatch(tabChanged(t.id))}>
          {t.label} {counts[t.id]}
        </button>
      ))}
    </div>
  );
}

function Toolbar() {
  const dispatch = useAppDispatch();
  const ui = useAppSelector((st) => st.ui);
  const now = useAppSelector(selectNowMinute);
  const flights = useAppSelector((st) => st.inbox.flights.length);
  const endDay = formatWeekday(now + ui.windowHours * 3_600_000);
  return (
    <div className={s.toolbar}>
      {ui.tab === "flights" && (
        <select className={s.toolSelect} aria-label="Flights">
          <option>ALL FLIGHTS ({flights})</option>
        </select>
      )}
      <select className={s.toolSelect} aria-label="Dispatch mode" defaultValue="eta">
        <option value="eta">DISPATCH BY ETA</option>
        <option value="queue">DISPATCH BY ZONE QUEUE</option>
      </select>
      <span className={s.toolText}>NOW</span>
      <span className={s.toolComputed}>{formatWeekday(now)}</span>
      <span aria-hidden="true">&gt;&gt;</span>
      <select className={s.toolSelect} value={ui.windowHours} onChange={(e) => dispatch(windowChanged(Number(e.target.value)))} aria-label="Look-ahead window">
        {APP.windowOptions.map((h) => (
          <option key={h} value={h}>
            {h}HR
          </option>
        ))}
      </select>
      <span className={s.toolComputed}>{endDay === formatWeekday(now) ? "N/A" : endDay}</span>
      <Toggle on={ui.filters.recurring} onChange={() => dispatch(filterToggled("recurring"))}>
        Rec jobs
      </Toggle>
      <Toggle on={ui.filters.tickets} onChange={() => dispatch(filterToggled("tickets"))}>
        Tkt jobs
      </Toggle>
      <Toggle on={ui.filters.groups} onChange={() => dispatch(filterToggled("groups"))}>
        Groups
      </Toggle>
      <Button variant="light" size="sm" icon="eyeOff" label={ui.hideZoneCols ? "Show zone columns" : "Hide zone columns"} onClick={() => dispatch(zoneColsToggled())} />
    </div>
  );
}

/** Flights tab: one line per tracked flight, as in the current console. */
export function FlightList({ flights }: { flights: Flight[] }) {
  const dispatch = useAppDispatch();
  if (!flights.length) return <div style={{ padding: 16, color: "var(--text-3)" }}>No flights are being tracked.</div>;
  return (
    <div>
      {flights.map((f) => (
        <div key={f.id} className={s.flight}>
          <span>{f.airline}</span>
          <span>Flight: {f.number}</span>
          <span>{f.from}</span>
          <Icon name="arrowRight" size={18} />
          <span>{f.to}</span>
          <span>
            <small>Arrival</small> {formatFleetDate(f.arrival)} {formatFleetTime(f.arrival)}
          </span>
          <span>
            <small>Scheduled</small> {formatFleetDate(f.scheduled)} {formatFleetTime(f.scheduled)}
          </span>
          <span style={{ color: f.status === "Delayed" ? "var(--waiting)" : undefined, fontWeight: 600 }}>Status: {f.status}</span>
          <span>Bookings: {f.bookings}</span>
          <Button variant="danger" size="sm" onClick={() => void dispatch(deleteFlight(f.id))}>
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}

export function JobsArea() {
  const dispatch = useAppDispatch();
  const tab = useAppSelector((st) => st.ui.tab);
  const sort = useAppSelector((st) => st.ui.sort);
  const hideZones = useAppSelector((st) => st.ui.hideZoneCols);
  const selectedId = useAppSelector((st) => st.ui.selectedJobId);
  const rows = useAppSelector(selectVisibleJobs);
  const drivers = useAppSelector(selectDriverEntities);
  const now = useAppSelector(selectNowMinute);
  const flights = useAppSelector((st) => st.inbox.flights);
  const columns = useMemo(() => jobColumns({ drivers, now }, hideZones), [drivers, now, hideZones]);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const rowAttrs = (job: Job) => ({
    className: `${s.jobRow} ${job.id === selectedId ? s.jobRowSelected : ""}`,
    "data-tone": JOB_STATUS[job.status].tone,
    "aria-selected": job.id === selectedId,
    title: "Right-click for actions",
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ jobId: job.id, x: e.clientX, y: e.clientY });
    },
  });

  return (
    <section className={s.jobs} aria-label="Jobs">
      <div className={s.jobsBar}>
        <StatusTabs />
        <Toolbar />
      </div>
      <div className={s.grid}>
        {tab === "flights" ? (
          <FlightList flights={flights} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(j) => j.id}
            rowAttrs={rowAttrs}
            rowHeight={32}
            onRowClick={(j) => dispatch(jobSelected(j.id))}
            sort={sort}
            sortable={SORTABLE}
            onSort={(key) => dispatch(sortToggled(key as SortKey))}
            empty={tab === "network" ? "No jobs shared with partner fleets" : "No jobs"}
          />
        )}
      </div>
      {menu && <JobMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
