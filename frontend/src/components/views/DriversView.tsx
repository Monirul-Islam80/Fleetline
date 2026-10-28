"use client";

import { useState } from "react";
import { SITES, VEHICLES } from "@/config/app";
import { DRIVER_STATUS } from "@/config/status";
import { useApi } from "@/hooks/useApi";
import { formatPhone, formatWait } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppSelector } from "@/store/hooks";
import type { DriverQuery } from "@/types/api";
import type { Driver } from "@/types/domain";
import { Button, Callsign, Card } from "../ui/controls";
import { DataTable, type Column } from "../ui/DataTable";
import { QueryForm, type FieldDef, type Setter } from "./QueryForm";
import s from "./views.module.css";

const emptyQuery = (): DriverQuery => ({ ref: "", vehicleRef: "", imei: "", name: "", badge: "", plate: "", phone: "", version: "ALL", siteId: "ALL", active: "ALL", sort: "callsign" });

const COLUMNS: FieldDef<DriverQuery>[][] = [
  [
    { label: "Ref/ID", key: "ref" },
    { label: "Veh ref", key: "vehicleRef" },
    { label: "Veh reg plate", key: "plate" },
    { label: "IMEI", key: "imei" },
    { label: "Site", key: "siteId", options: [{ value: "ALL", label: "ALL SITES" }, ...SITES.map((x) => ({ value: x.id, label: x.name }))] },
    {
      label: "Sort",
      key: "sort",
      options: [
        { value: "callsign", label: "DRV REF" },
        { value: "name", label: "NAME" },
      ],
    },
  ],
  [
    { label: "Name", key: "name" },
    { label: "Badge/PSV", key: "badge" },
    { label: "Phone", key: "phone" },
    {
      label: "Active",
      key: "active",
      options: [
        { value: "ALL", label: "ALL" },
        { value: "ONLINE", label: "ONLINE" },
        { value: "OFFLINE", label: "OFFLINE" },
      ],
    },
    {
      label: "Version",
      key: "version",
      options: [
        { value: "ALL", label: "ALL" },
        { value: "6.4.1", label: "6.4.1" },
        { value: "6.4.0", label: "6.4.0" },
        { value: "6.3.8", label: "6.3.8" },
      ],
    },
  ],
];

export function DriversView() {
  const now = useAppSelector((st) => st.fleet.now);
  const [query, setQuery] = useState(emptyQuery);
  const set: Setter<DriverQuery> = (key, value) => setQuery((q) => ({ ...q, [key]: value }));
  const search = useApi((api) => api.searchDrivers(query));

  const cols: Column<Driver>[] = [
    { key: "ref", label: "Ref", width: "60px", render: (d) => <Callsign value={d.callsign} /> },
    { key: "name", label: "Name", width: "1.2fr", render: (d) => d.name },
    { key: "veh", label: "Vehicle", width: "0.8fr", render: (d) => VEHICLES[d.vehicle].label },
    { key: "plate", label: "Plate", width: "100px", render: (d) => d.plate },
    { key: "badge", label: "Badge/PSV", width: "90px", render: (d) => d.badge },
    { key: "phone", label: "Phone", width: "130px", render: (d) => formatPhone(d.phone) },
    { key: "site", label: "Site", width: "1.2fr", render: (d) => SITES.find((x) => x.id === d.siteId)?.name },
    { key: "status", label: "Status", width: "100px", render: (d) => DRIVER_STATUS[d.status].label },
    { key: "zone", label: "Zone", width: "1fr", render: (d) => zoneName(d.zoneId).toUpperCase() },
    { key: "for", label: "For", width: "70px", render: (d) => formatWait(now - d.statusSince) },
    { key: "ver", label: "Version", width: "70px", render: (d) => d.appVersion },
  ];

  return (
    <div className={s.view}>
      <Card title="Drivers">
        <div className={s.cardBody}>
          <QueryForm columns={COLUMNS} query={query} set={set} onSubmit={() => void search.run()} />
          <div className={s.actions}>
            <Button onClick={() => setQuery(emptyQuery())}>Clear form</Button>
            <span style={{ flex: 1 }} />
            <Button className={s.wide} onClick={() => void search.run()} disabled={search.loading}>
              {search.loading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      </Card>
      {search.data && (
        <div className={s.results}>
          <DataTable light columns={cols} rows={search.data} rowKey={(d) => d.id} empty="No drivers match" />
        </div>
      )}
    </div>
  );
}
