"use client";

import { APP } from "@/config/app";
import { JOB_TABS } from "@/config/status";
import { registerFocus } from "@/lib/focusRegistry";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectTabCounts } from "@/store/selectors";
import { filterToggled, gridQueryChanged, tabChanged, windowChanged } from "@/store/slices/uiSlice";
import { Icon } from "../ui/Icon";
import { Button, Count } from "../ui/primitives";
import { JobGrid } from "./JobGrid";
import s from "./jobs.module.css";

const gridSearchRef = registerFocus("gridSearch");

function StatusTabs() {
  const dispatch = useAppDispatch();
  const tab = useAppSelector((st) => st.ui.tab);
  const counts = useAppSelector(selectTabCounts);
  return (
    <div className={s.tabs} role="tablist" aria-label="Job lists">
      {JOB_TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={s.tab} onClick={() => dispatch(tabChanged(t.id))}>
          {t.label}
          <Count value={counts[t.id]} tone={t.id === "dispatch" ? "hot" : undefined} />
        </button>
      ))}
    </div>
  );
}

function Toolbar() {
  const dispatch = useAppDispatch();
  const windowHours = useAppSelector((st) => st.ui.windowHours);
  const filters = useAppSelector((st) => st.ui.filters);
  const query = useAppSelector((st) => st.ui.gridQuery);

  return (
    <div className={s.tools}>
      <label className={s.windowSelect} title="How far ahead the pre-booked list looks">
        Next
        <select value={windowHours} onChange={(e) => dispatch(windowChanged(Number(e.target.value)))}>
          {APP.windowOptions.map((h) => (
            <option key={h} value={h}>
              {h} h
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" icon="repeat" active={filters.recurring} onClick={() => dispatch(filterToggled("recurring"))} label="Show recurring jobs">
        <span className={s.toolLabel}>Recurring</span>
      </Button>
      <Button size="sm" icon="plane" active={filters.flights} onClick={() => dispatch(filterToggled("flights"))} label="Show airport jobs">
        <span className={s.toolLabel}>Flights</span>
      </Button>
      <Button size="sm" icon="users" active={filters.accounts} onClick={() => dispatch(filterToggled("accounts"))} label="Show account jobs">
        <span className={s.toolLabel}>Accounts</span>
      </Button>
      <label className={s.gridSearch}>
        <Icon name="filter" size={13} />
        <input
          ref={gridSearchRef}
          placeholder="Filter by job, name, phone, car"
          value={query}
          onChange={(e) => dispatch(gridQueryChanged(e.target.value))}
          aria-label="Filter jobs"
        />
        {query && (
          <button type="button" aria-label="Clear filter" onClick={() => dispatch(gridQueryChanged(""))}>
            <Icon name="x" size={12} />
          </button>
        )}
      </label>
    </div>
  );
}

export function JobsPanel() {
  return (
    <section className={s.panel} aria-label="Jobs">
      <div className={s.bar}>
        <StatusTabs />
        <span className={s.spacer} />
        <Toolbar />
      </div>
      <JobGrid />
    </section>
  );
}
