"use client";

import { useState } from "react";
import { formatWait } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectNowMinute, selectWaitingTimes, selectZoneQueues } from "@/store/selectors";
import { driverFocused } from "@/store/slices/uiSlice";
import type { Driver } from "@/types/domain";
import { Callsign, Select } from "../ui/controls";
import { DataTable, type Column } from "../ui/DataTable";
import s from "./dispatch.module.css";

type Mode = "waiting" | "queues";

/** Right-hand panel: parked drivers by how long they have waited, or queue length per zone. */
export function WaitingTimes() {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<Mode>("waiting");
  const now = useAppSelector(selectNowMinute);
  const waiting = useAppSelector(selectWaitingTimes);
  const queues = useAppSelector(selectZoneQueues);

  const waitCols: Column<Driver>[] = [
    { key: "drv", label: "Drv", width: "52px", render: (d) => <Callsign value={d.callsign} /> },
    { key: "zone", label: "Zones", width: "1fr", align: "center", render: (d) => zoneName(d.zoneId).toUpperCase() },
    { key: "wait", label: "Wait", width: "62px", align: "right", render: (d) => formatWait(now - d.statusSince) },
  ];
  const queueCols: Column<(typeof queues)[number]>[] = [
    { key: "zone", label: "Zone", width: "1fr", render: (q) => q.zone.name.toUpperCase() },
    { key: "count", label: "Cars", width: "50px", align: "right", render: (q) => q.drivers.length },
  ];

  return (
    <section className={`${s.card} ${s.waitingCard}`} aria-label="Waiting times">
      <Select
        className={s.waitingHead}
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
        options={[
          { value: "waiting", label: "Plot Waiting Times" },
          { value: "queues", label: "Zone Queues" },
        ]}
        aria-label="Panel"
      />
      {mode === "waiting" ? (
        <DataTable light columns={waitCols} rows={waiting} rowKey={(d) => d.id} onRowClick={(d) => dispatch(driverFocused(d.id))} empty="No parked drivers" />
      ) : (
        <DataTable light columns={queueCols} rows={queues} rowKey={(q) => q.zone.id} />
      )}
    </section>
  );
}
