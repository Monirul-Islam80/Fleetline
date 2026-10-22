"use client";

import { memo, type CSSProperties, type KeyboardEvent } from "react";
import { JOB_STATUS, JOB_TABS } from "@/config/status";
import { cx } from "@/lib/cx";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isOverdue, selectDriverEntities, selectVisibleJobs } from "@/store/selectors";
import { jobSelected, sortToggled } from "@/store/slices/uiSlice";
import type { Driver, Job } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Empty } from "../ui/primitives";
import { COLUMNS, GRID_TEMPLATE, type CellContext } from "./columns";
import s from "./jobs.module.css";

const ROW_HEIGHT = 34;
const gridStyle = { "--cols": GRID_TEMPLATE } as CSSProperties;

interface RowProps {
  job: Job;
  ctx: CellContext;
  top: number;
  selected: boolean;
  onOpen: (id: string) => void;
}

const JobRow = memo(
  function JobRow({ job, ctx, top, selected, onOpen }: RowProps) {
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(job.id);
      }
    };
    return (
      <div
        role="row"
        tabIndex={0}
        aria-selected={selected}
        className={cx(s.row, selected && s.selected)}
        data-tone={JOB_STATUS[job.status].tone}
        style={{ transform: `translateY(${top}px)` }}
        onClick={() => onOpen(job.id)}
        onKeyDown={onKeyDown}
      >
        {COLUMNS.map((col) => (
          <div key={col.id} role="cell" className={cx(s.cell, col.align === "right" && s.money)}>
            {col.render(job, ctx)}
          </div>
        ))}
      </div>
    );
  },
  // Re-render a row only when something it shows has changed.
  (a, b) =>
    a.job === b.job &&
    a.top === b.top &&
    a.selected === b.selected &&
    a.ctx.overdue === b.ctx.overdue &&
    a.ctx.minutesToPickup === b.ctx.minutesToPickup &&
    a.ctx.driver?.status === b.ctx.driver?.status &&
    a.ctx.offerTo?.status === b.ctx.offerTo?.status &&
    a.ctx.designated === b.ctx.designated,
);

function GridHead() {
  const dispatch = useAppDispatch();
  const sort = useAppSelector((st) => st.ui.sort);
  return (
    <div className={s.head} role="row">
      {COLUMNS.map((col) => {
        const sorted = col.sort && sort.key === col.sort;
        const ariaSort = sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined;
        if (!col.sort) {
          return (
            <span key={col.id} role="columnheader" className={cx(s.headCell, col.align === "right" && s.right)}>
              {col.label}
            </span>
          );
        }
        const key = col.sort;
        return (
          <button
            key={col.id}
            type="button"
            role="columnheader"
            aria-sort={ariaSort}
            className={cx(s.headCell, col.align === "right" && s.right)}
            onClick={() => dispatch(sortToggled(key))}
          >
            {col.label}
            {sorted && <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} size={12} />}
          </button>
        );
      })}
    </div>
  );
}

function buildContext(job: Job, drivers: Record<string, Driver | undefined>, now: number): CellContext {
  return {
    driver: job.driverId ? drivers[job.driverId] : undefined,
    offerTo: job.offer ? drivers[job.offer.driverId] : undefined,
    designated: job.designatedDriverId ? drivers[job.designatedDriverId] : undefined,
    overdue: isOverdue(job, now),
    minutesToPickup: Math.round((job.pickupAt - now) / 60_000),
  };
}

export function JobGrid() {
  const dispatch = useAppDispatch();
  const jobs = useAppSelector(selectVisibleJobs);
  const drivers = useAppSelector(selectDriverEntities);
  const tab = useAppSelector((st) => st.ui.tab);
  const query = useAppSelector((st) => st.ui.gridQuery);
  const selectedId = useAppSelector((st) => st.ui.selectedJobId);
  const now = useAppSelector((st) => Math.floor(st.fleet.now / 60_000) * 60_000);
  const { viewportRef, onScroll, start, end, totalHeight } = useVirtualRows(jobs.length, ROW_HEIGHT);
  const onOpen = (id: string) => dispatch(jobSelected(id));
  const tabLabel = JOB_TABS.find((t) => t.id === tab)?.label.toLowerCase() ?? "";

  return (
    <div className={s.grid} style={gridStyle} role="table" aria-label="Jobs" aria-rowcount={jobs.length}>
      <GridHead />
      <div className={s.viewport} ref={viewportRef} onScroll={onScroll}>
        {jobs.length === 0 ? (
          <Empty
            title={query ? "No jobs match that search" : `No ${tabLabel} jobs`}
            hint={query ? "Search covers job number, name, phone, address and callsign." : tab === "network" ? "Jobs shared with partner fleets will show here." : undefined}
          />
        ) : (
          <div className={s.rows} style={{ height: totalHeight }} role="rowgroup">
            {jobs.slice(start, end).map((job, i) => (
              <JobRow
                key={job.id}
                job={job}
                ctx={buildContext(job, drivers, now)}
                top={(start + i) * ROW_HEIGHT}
                selected={job.id === selectedId}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
