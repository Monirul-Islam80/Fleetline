"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DRIVER_STATUS } from "@/config/status";
import { registerFocus } from "@/lib/focusRegistry";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAllDrivers, selectFlaggedZones, selectSelectedJob, selectTabBuckets } from "@/store/selectors";
import { driverFocused, jobSelected, mapQueryChanged, toastShown, zonesToggled } from "@/store/slices/uiSlice";
import type { LatLng } from "@/types/domain";
import { PLACES } from "@/mock/geography";
import { Icon } from "../ui/Icon";
import { Button, Input } from "../ui/controls";
import { useDismiss } from "../ui/overlays";
import type { BaseLayer } from "../map/MapController";
import { useMap } from "../map/useMap";
import s from "./dispatch.module.css";

interface Hit {
  key: string;
  label: string;
  sub: string;
  run: () => void;
}

/** "Booking Search..." (F6): jobs by number or name, drivers by callsign, places by name. */
function MapSearch({ onPlace }: { onPlace: (p: LatLng) => void }) {
  const dispatch = useAppDispatch();
  const query = useAppSelector((st) => st.ui.mapQuery);
  const drivers = useAppSelector(selectAllDrivers);
  const jobs = useAppSelector((st) => st.jobs.entities);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const jobHits = Object.values(jobs)
      .filter((j) => j && (String(j.number).includes(q) || j.customerName.toLowerCase().includes(q)))
      .slice(0, 4)
      .map((j) => ({ key: j!.id, label: `JOB ${j!.number}`, sub: j!.customerName, run: () => dispatch(jobSelected(j!.id)) }));
    const driverHits = drivers
      .filter((d) => d.callsign.startsWith(q))
      .slice(0, 4)
      .map((d) => ({ key: d.id, label: `CAR ${d.callsign}`, sub: DRIVER_STATUS[d.status].label, run: () => dispatch(driverFocused(d.id)) }));
    const placeHits = PLACES.filter((p) => p.label.toLowerCase().includes(q))
      .slice(0, 3)
      .map((p) => ({ key: p.id, label: p.label.toUpperCase(), sub: p.area, run: () => onPlace(p) }));
    return [...jobHits, ...driverHits, ...placeHits];
  }, [query, jobs, drivers, dispatch, onPlace]);

  const choose = (hit: Hit | undefined) => {
    hit?.run();
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(hits.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") choose(hits[active]);
  };

  return (
    <div className={`${s.combo} ${s.search}`}>
      <Input
        ref={registerFocus("search")}
        placeholder="Booking search..."
        value={query}
        onChange={(e) => {
          dispatch(mapQueryChanged(e.target.value));
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        aria-label="Booking search (F6)"
      />
      {open && hits.length > 0 && (
        <ul className={s.results} role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.key}
              role="option"
              aria-selected={i === active}
              className={s.option}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
            >
              <span>{h.label}</span>
              <small>{h.sub}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionsMenu({ pickups, onPickups }: { pickups: boolean; onPickups: (v: boolean) => void }) {
  const dispatch = useAppDispatch();
  const zones = useAppSelector((st) => st.ui.showZones);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Options
      </Button>
      {open && (
        <div className={s.menu}>
          <label>
            <input type="checkbox" checked={zones} onChange={() => dispatch(zonesToggled())} /> Show zones
          </label>
          <label>
            <input type="checkbox" checked={pickups} onChange={(e) => onPickups(e.target.checked)} /> Show waiting pickups
          </label>
        </div>
      )}
    </div>
  );
}

/** Live map with the same controls and bottom bar as the current console. */
export function DispatchMap() {
  const dispatch = useAppDispatch();
  const onDriverClick = useMemo(() => (id: string) => dispatch(driverFocused(id)), [dispatch]);
  const { ref, map } = useMap(onDriverClick);
  const drivers = useAppSelector(selectAllDrivers);
  const zones = useAppSelector((st) => st.fleet.zones);
  const flagged = useAppSelector(selectFlaggedZones).length;
  const showZones = useAppSelector((st) => st.ui.showZones);
  const focusedId = useAppSelector((st) => st.ui.focusedDriverId);
  const live = useAppSelector((st) => selectTabBuckets(st).dispatch);
  const job = useAppSelector(selectSelectedJob);
  const jobDriver = useAppSelector((st) => (job?.driverId ? st.fleet.drivers.entities[job.driverId] : undefined));
  const [base, setBase] = useState<BaseLayer>("map");
  const [pickups, setPickups] = useState(true);
  const [traffic, setTraffic] = useState(false);
  const waiting = useMemo(() => live.filter((j) => j.status === "NEW" || j.status === "PAUSED" || j.status === "BIDDING"), [live]);

  useEffect(() => map?.setBaseLayer(base), [map, base]);
  useEffect(() => map?.syncDrivers(drivers, focusedId), [map, drivers, focusedId]);
  useEffect(() => map?.syncPickups(pickups ? waiting : []), [map, waiting, pickups]);
  useEffect(() => map?.syncZones(zones, showZones), [map, zones, showZones]);

  // Move the view only when the focus or selection changes, not on every position update.
  const flyToDriver = useEffectEvent(() => {
    const d = drivers.find((x) => x.id === focusedId);
    if (d) map?.flyTo(d);
  });
  useEffect(() => flyToDriver(), [focusedId, map]);
  const drawRoute = useEffectEvent(() => map?.showRoute(job ?? null, jobDriver ?? null));
  useEffect(() => drawRoute(), [job?.id, jobDriver?.id, map]);

  const soon = (what: string) => () => dispatch(toastShown({ tone: "info", text: `${what} is planned for a later phase` }));

  return (
    <section className={`${s.card} ${s.mapCard}`} aria-label="Live map">
      <div className={s.mapWrap}>
        <div ref={ref} className={s.mapCanvas} />
        {job?.instructions ? (
          <div className={s.note}>{job.instructions}</div>
        ) : (
          <select className={s.mapType} value={base} onChange={(e) => setBase(e.target.value as BaseLayer)} aria-label="Map type">
            <option value="map">Map</option>
            <option value="satellite">Satellite</option>
          </select>
        )}
        <button type="button" className={s.expand} title="Large map" aria-label="Large map" onClick={() => window.open("/playback", "_blank", "noopener")}>
          <Icon name="plus" size={16} strokeWidth={2.6} />
        </button>
        <div className={s.mapControls}>
          <button type="button" title="Fit all cars" aria-label="Fit all cars" onClick={() => map?.fitDrivers()}>
            <Icon name="fullscreen" size={20} />
          </button>
          <button type="button" title="Select an area" aria-label="Select an area" onClick={soon("Area select")} style={{ marginTop: 28 }}>
            <Icon name="area" size={20} />
          </button>
          <button type="button" title="Traffic" aria-label="Traffic" aria-pressed={traffic} onClick={() => setTraffic((t) => !t)}>
            <Icon name="traffic" size={20} />
          </button>
          <div className={`${s.zoom} ${s.push}`}>
            <button type="button" aria-label="Zoom in" onClick={() => map?.zoom(1)}>
              <Icon name="plus" size={20} />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => map?.zoom(-1)}>
              <Icon name="minus" size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className={s.mapBar}>
        <MapSearch onPlace={(p) => map?.flyTo(p)} />
        <Button onClick={() => dispatch(mapQueryChanged(""))}>Clear</Button>
        <OptionsMenu pickups={pickups} onPickups={setPickups} />
        <Button onClick={() => dispatch(zonesToggled())} aria-pressed={showZones}>
          Zones
        </Button>
        <span className={s.mapStat}>Zones {flagged}</span>
        <button type="button" className={s.mapStat} onClick={() => map?.fitDrivers()}>
          Overview
        </button>
        <span className={s.mapStatDark}>Map {drivers.filter((d) => d.status !== "AWAY").length}</span>
      </div>
    </section>
  );
}
