"use client";

import { useEffect, useState } from "react";
import { APP } from "@/config/app";
import { useApi } from "@/hooks/useApi";
import { fleetDateText, fleetDayRange } from "@/lib/time";
import { useAppSelector } from "@/store/hooks";
import type { LatLng } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Button, Input } from "../ui/controls";
import { useMap } from "../map/useMap";
import s from "./pages.module.css";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
};

/** Replays where drivers went in a time window around a point. Tracks come from the API. */
export function Playback() {
  const now = useAppSelector((st) => st.fleet.now);
  const zones = useAppSelector((st) => st.fleet.zones);
  const { ref, map } = useMap();
  const [date, setDate] = useState(() => fleetDateText(Date.now()));
  const [mode, setMode] = useState<"period" | "booking">("period");
  const [start, setStart] = useState("05:00");
  const [end, setEnd] = useState("05:15");
  const [by, setBy] = useState<"radius" | "drivers">("radius");
  const [centre, setCentre] = useState<LatLng>(APP.mapCentre);
  const [showTracks, setShowTracks] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [progress, setProgress] = useState(1);

  const day = fleetDayRange(date, now)?.start ?? now;
  const tracks = useApi((api) => api.driverTracks({ from: day + toMinutes(start), to: day + toMinutes(end), centre, radiusM: 6000 }));

  useEffect(() => {
    if (!map) return;
    map.setView(APP.mapCentre, 12);
    map.onClick(setCentre);
  }, [map]);
  useEffect(() => map?.syncZones(zones, showZones, true), [map, zones, showZones]);
  useEffect(() => {
    const data = showTracks ? (tracks.data ?? []) : [];
    map?.showTracks(data.map((t) => ({ ...t, points: t.points.slice(0, Math.max(2, Math.round(t.points.length * progress))) })));
  }, [map, tracks.data, showTracks, progress]);

  const play = () => {
    setProgress(0);
    let p = 0;
    const id = window.setInterval(() => {
      p = Math.min(1, p + 0.02);
      setProgress(p);
      if (p >= 1) window.clearInterval(id);
    }, 80);
  };

  return (
    <div className={s.playback}>
      <aside className={s.side}>
        <div className={s.sideHead}>
          <Icon name="map" size={24} /> Driver Playback
        </div>
        <div className={s.sideBody}>
          <Input value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <label className={s.radio}>
            <input type="radio" checked={mode === "period"} onChange={() => setMode("period")} /> Select specific time period
          </label>
          <label className={s.radio}>
            <input type="radio" checked={mode === "booking"} onChange={() => setMode("booking")} /> Select by booking
          </label>
          <label className={s.fieldLabel}>
            Start time:
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={s.fieldLabel}>
            End time:
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className={s.radioRow}>
            <label className={s.radio}>
              <input type="radio" checked={by === "radius"} onChange={() => setBy("radius")} /> Radius
            </label>
            <label className={s.radio}>
              <input type="radio" checked={by === "drivers"} onChange={() => setBy("drivers")} /> Select driver(s)
            </label>
          </div>
          <Input computed value={`${centre.lat.toFixed(4)}, ${centre.lng.toFixed(4)}`} aria-label="Centre point" />
          <span className={s.hint}>Click the map to move the centre point.</span>
          <Button variant="primary" onClick={() => void tracks.run()} disabled={tracks.loading}>
            {tracks.loading ? "Searching..." : "Search"}
          </Button>
          {tracks.data && <span className={s.hint}>{tracks.data.length} driver tracks found</span>}
        </div>
      </aside>
      <div className={s.mapArea}>
        <div ref={ref} className={s.mapCanvas} />
        <div className={s.zoomCtl}>
          <button type="button" aria-label="Zoom in" onClick={() => map?.zoom(1)}>
            <Icon name="plus" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => map?.zoom(-1)}>
            <Icon name="minus" />
          </button>
        </div>
        <div className={s.mapToggles}>
          <label>
            <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} /> GPS tracks
          </label>
          <label>
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} /> Zones
          </label>
        </div>
        <Button className={s.play} variant="light" icon="play" onClick={play} disabled={!tracks.data?.length}>
          Play
        </Button>
      </div>
    </div>
  );
}
