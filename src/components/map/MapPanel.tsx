"use client";

import { useCallback, useEffect, useEffectEvent, useId, useMemo, useState, type KeyboardEvent } from "react";
import { KEYMAP } from "@/config/keymap";
import { DRIVER_STATUS, LEGEND } from "@/config/status";
import { registerFocus } from "@/lib/focusRegistry";
import { PLACES } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAllDrivers, selectTabBuckets } from "@/store/selectors";
import { driverFocused, jobSelected, zonesToggled } from "@/store/slices/uiSlice";
import type { LatLng } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Button, Kbd, StatusDot } from "../ui/primitives";
import { MapController } from "./mapController";
import s from "./map.module.css";

const searchRef = registerFocus("search");

interface SearchHit {
  key: string;
  label: string;
  sub: string;
  run: () => void;
}

function MapSearch({ onPlace }: { onPlace: (p: LatLng) => void }) {
  const dispatch = useAppDispatch();
  const drivers = useAppSelector(selectAllDrivers);
  const dispatchJobs = useAppSelector((st) => selectTabBuckets(st).dispatch);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const driverHits = drivers
      .filter((d) => d.callsign.startsWith(q) || d.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map<SearchHit>((d) => ({ key: d.id, label: `${d.callsign} ${d.name}`, sub: DRIVER_STATUS[d.status].label, run: () => dispatch(driverFocused(d.id)) }));
    const jobHits = dispatchJobs
      .filter((j) => String(j.number).includes(q))
      .slice(0, 3)
      .map<SearchHit>((j) => ({ key: j.id, label: `Job ${j.number}`, sub: j.pickup.label, run: () => dispatch(jobSelected(j.id)) }));
    const placeHits = PLACES.filter((p) => `${p.label} ${p.area}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map<SearchHit>((p) => ({ key: p.id, label: p.label, sub: p.area, run: () => onPlace(p) }));
    return [...driverHits, ...jobHits, ...placeHits];
  }, [query, drivers, dispatchJobs, dispatch, onPlace]);

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    hit.run();
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      choose(hits[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={s.search}>
      <label className={s.searchControl}>
        <Icon name="search" size={14} />
        <input
          ref={searchRef}
          className={s.searchInput}
          placeholder="Find a driver, job or place"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          aria-label="Search the map"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open && hits.length > 0}
        />
        <Kbd>{KEYMAP.search.hint}</Kbd>
      </label>
      {open && hits.length > 0 && (
        <ul className={s.results} id={listId} role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.key}
              role="option"
              aria-selected={i === active}
              className={s.result}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {h.label}
              <span className={s.resultSub}>{h.sub}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MapPanel() {
  const dispatch = useAppDispatch();
  const [controller, setController] = useState<MapController | null>(null);

  const theme = useAppSelector((st) => st.ui.theme);
  const drivers = useAppSelector(selectAllDrivers);
  const zones = useAppSelector((st) => st.fleet.zones);
  const showZones = useAppSelector((st) => st.ui.showZones);
  const focusedDriverId = useAppSelector((st) => st.ui.focusedDriverId);
  const now = useAppSelector((st) => st.fleet.now);
  const dispatchJobs = useAppSelector((st) => selectTabBuckets(st).dispatch);
  const selectedJob = useAppSelector((st) => (st.ui.selectedJobId ? st.jobs.entities[st.ui.selectedJobId] : undefined));
  const selectedDriver = useAppSelector((st) => (selectedJob?.driverId ? st.fleet.drivers.entities[selectedJob.driverId] : undefined));
  const waiting = useMemo(() => dispatchJobs.filter((j) => j.status === "NEW" || j.status === "BIDDING" || j.status === "PAUSED"), [dispatchJobs]);

  // The map lives as long as its container node. React 19 runs the returned cleanup on unmount.
  const mapRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const instance = new MapController(
        node,
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
        (id) => dispatch(driverFocused(id)),
        (jobId) => dispatch(jobSelected(jobId)),
      );
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(node);
      setController(instance);
      return () => {
        observer.disconnect();
        instance.destroy();
        setController(null);
      };
    },
    [dispatch],
  );

  useEffect(() => controller?.setTheme(theme), [controller, theme]);
  useEffect(() => controller?.syncDrivers(drivers, focusedDriverId), [controller, drivers, focusedDriverId]);
  useEffect(() => controller?.syncPickups(waiting, now), [controller, waiting, now]);
  // Zone colours come from CSS variables, so re-sync when the theme changes too.
  useEffect(() => controller?.syncZones(zones, showZones), [controller, zones, showZones, theme]);

  // Fly only when the focused driver changes, not on every position tick.
  const focused = focusedDriverId ? drivers.find((d) => d.id === focusedDriverId) : undefined;
  const flyToFocused = useEffectEvent(() => {
    if (focused) controller?.flyTo(focused);
  });
  useEffect(() => flyToFocused(), [focusedDriverId, controller]);

  // Redraw the route when the selection changes, not when the selected car moves.
  const drawRoute = useEffectEvent(() => controller?.showRoute(selectedJob ?? null, selectedDriver ?? null));
  useEffect(() => drawRoute(), [selectedJob?.id, selectedDriver?.id, controller]);

  return (
    <div className={s.panel}>
      <div className={s.toolbar}>
        <MapSearch onPlace={(p) => controller?.flyTo(p, 15)} />
        <Button size="sm" icon="layers" active={showZones} onClick={() => dispatch(zonesToggled())}>
          Zones
        </Button>
        <Button size="sm" icon="maximize" iconOnly label="Show all cars" onClick={() => controller?.fitAll()} />
        <span className={s.stat}>
          <b>{drivers.length}</b> cars
        </span>
      </div>
      <div className={s.mapWrap}>
        <div ref={mapRef} className={s.map} aria-label="Map of drivers and waiting pickups" role="application" />
        <div className={s.zoom}>
          <button type="button" aria-label="Zoom in" onClick={() => controller?.zoom(1)}>
            <Icon name="plus" size={15} />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => controller?.zoom(-1)}>
            <Icon name="minus" size={15} />
          </button>
        </div>
        <div className={s.legend} aria-label="Map legend">
          {LEGEND.map((l) => (
            <span key={l.tone} className={s.legendItem}>
              <StatusDot tone={l.tone} />
              {l.label}
            </span>
          ))}
          <span className={s.legendItem}>
            <span style={{ width: 8, height: 8, transform: "rotate(45deg)", background: "var(--tone-waiting)", borderRadius: 2 }} />
            Waiting pickup
          </span>
        </div>
      </div>
    </div>
  );
}
