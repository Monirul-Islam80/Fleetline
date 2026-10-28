"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatFleetDate, formatFleetTime } from "@/lib/format";
import { fleetDayRange } from "@/lib/time";
import { useAppSelector } from "@/store/hooks";
import type { LogQuery } from "@/types/api";
import type { LogCategory } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Adornment, Button, Card, Input, Toggle } from "../ui/controls";
import s from "./views.module.css";

const CATEGORIES: { id: LogCategory; label: string }[] = [
  { id: "SYSTEM", label: "System logs" },
  { id: "DRIVER", label: "Driver actions" },
  { id: "ZONE", label: "Zone logs" },
  { id: "FEEDERSET", label: "Feederset logs" },
  { id: "PANIC", label: "Panic logs" },
  { id: "OPERATOR", label: "Operator actions" },
];

type TextFilter = "driver" | "vehicle" | "zone" | "jobNumber" | "routeId" | "operator" | "action";
const FILTERS: { key: TextFilter; label: string }[] = [
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle" },
  { key: "zone", label: "Zone" },
  { key: "jobNumber", label: "Job number" },
  { key: "routeId", label: "Route ID" },
  { key: "operator", label: "Operator" },
  { key: "action", label: "Action" },
];

const DAY = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

export function LogsView() {
  const now = useAppSelector((st) => st.fleet.now);
  const [day, setDay] = useState(now);
  const [filters, setFilters] = useState<Record<TextFilter, string>>({ driver: "", vehicle: "", zone: "", jobNumber: "", routeId: "", operator: "", action: "" });
  const [categories, setCategories] = useState<LogCategory[]>(CATEGORIES.map((c) => c.id));
  const [oldestFirst, setOldestFirst] = useState(false);
  const [live, setLive] = useState(true);
  const [raw, setRaw] = useState(false);
  const { routeId: _route, ...textFilters } = filters;
  const query: LogQuery = { day, ...textFilters, categories, oldestFirst };
  const logs = useApi((api) => api.searchLogs(query), { auto: true, delayMs: 200, deps: [JSON.stringify(query)] });

  // Live: refresh every 5 seconds while switched on.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void logs.run(), 5000);
    return () => window.clearInterval(id);
  }, [live, logs.run]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = fleetDayRange(day, now);
  const isToday = range ? now >= range.start && now <= range.end : false;
  const filled = isToday && range ? ((now - range.start) / DAY) * 100 : 100;
  const reset = () => {
    setFilters({ driver: "", vehicle: "", zone: "", jobNumber: "", routeId: "", operator: "", action: "" });
    setCategories(CATEGORIES.map((c) => c.id));
  };

  return (
    <div className={s.view}>
      <Card>
        <div className={s.cardBody}>
          <div className={s.ruler} aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className={s.track} aria-label="Time covered">
            <div className={s.trackFill} style={{ width: `${filled}%` }} />
          </div>

          <div className={s.filters}>
            <div className={s.dayNav}>
              <button type="button" aria-label="Previous day" onClick={() => setDay((d) => d - DAY)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              {isToday ? "Today" : formatFleetDate(day)}
              <button type="button" aria-label="Next day" onClick={() => setDay((d) => d + DAY)} disabled={isToday}>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
            {FILTERS.map((f) => (
              <Input
                key={f.key}
                placeholder={f.label}
                value={filters[f.key]}
                onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value }))}
                adornment={filters[f.key] ? <Adornment icon="x" label={`Clear ${f.label}`} onClick={() => setFilters((x) => ({ ...x, [f.key]: "" }))} /> : undefined}
              />
            ))}
          </div>

          <div className={s.cats}>
            {CATEGORIES.map((c) => (
              <Toggle key={c.id} on={categories.includes(c.id)} onChange={(on) => setCategories((list) => (on ? [...list, c.id] : list.filter((x) => x !== c.id)))}>
                {c.label}
              </Toggle>
            ))}
          </div>

          <div className={s.logTools}>
            <Button size="sm" variant="light" icon="dot" onClick={() => setLive((v) => !v)} style={{ color: live ? "var(--ok)" : undefined }}>
              Live
            </Button>
            <Button size="sm" variant="light" icon={oldestFirst ? "sortUp" : "sortDown"} onClick={() => setOldestFirst((v) => !v)}>
              {oldestFirst ? "Oldest first" : "Newest first"}
            </Button>
            <Button size="sm" variant="light" icon="code" label="Show raw data" onClick={() => setRaw((v) => !v)} />
            <Button size="sm" variant="light" icon="refresh" label="Refresh" onClick={() => void logs.run()} />
          </div>

          {logs.data && logs.data.length === 0 && (
            <div className={s.logEmpty}>
              <Icon name="pin" size={16} /> 0 Logs found, please broaden your search criteria
              <Button size="sm" variant="light" icon="eraser" onClick={reset}>
                Reset filters
              </Button>
            </div>
          )}
          {raw && logs.data && <pre className={s.raw}>{JSON.stringify(logs.data.slice(0, 50), null, 2)}</pre>}
          {!raw && logs.data && logs.data.length > 0 && (
            <div className={s.logList}>
              {logs.data.map((l) => (
                <div key={l.id} className={s.log}>
                  <time>{formatFleetTime(l.at)}</time>
                  <span className={s.cat}>{CATEGORIES.find((c) => c.id === l.category)?.label.toUpperCase()}</span>
                  <span>{l.jobNumber ? `#${l.jobNumber}` : l.driver}</span>
                  <span>
                    {l.text}
                    {l.operator && <small style={{ color: "var(--text-3)" }}> by {l.operator}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
