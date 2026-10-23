"use client";

import { useState } from "react";
import { SITES } from "@/config/app";
import { JOB_STATUS } from "@/config/status";
import { useApi } from "@/hooks/useApi";
import { formatDayShort, formatMoney, formatPhone, formatWhen } from "@/lib/format";
import { fleetTimeToEpoch, parseFleetDate } from "@/lib/time";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { jobSelected, toastShown, viewChanged } from "@/store/slices/uiSlice";
import type { BookingQuery } from "@/types/api";
import type { Job } from "@/types/domain";
import { Button, Card, Input } from "../ui/controls";
import { DataTable, type Column } from "../ui/DataTable";
import { QueryForm, type FieldDef, type Setter } from "./QueryForm";
import s from "./views.module.css";

const PAGE_SIZE = 50;

const emptyQuery = (): BookingQuery => ({
  from: "",
  fromTime: "0000",
  to: "",
  toTime: "2359",
  siteId: "ALL",
  jobNumber: "",
  source: "ALL",
  status: "ALL",
  driver: "",
  address: "",
  destination: "",
  customerName: "",
  customerPhone: "",
  account: "",
  keyword: "",
  page: 1,
  pageSize: PAGE_SIZE,
});

/** Date text + yellow day readout + HHMM time, as in the FROM / TO rows. */
function DateTime({ date, time, onDate, onTime, now }: { date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; now: number }) {
  const parsed = parseFleetDate(date, now);
  return (
    <>
      <Input value={date} placeholder="Today" onChange={(e) => onDate(e.target.value)} />
      <Input computed value={parsed ? formatDayShort(fleetTimeToEpoch(parsed, 12, 0)) : "CHECK"} aria-label="Day" />
      <Input value={time} onChange={(e) => onTime(e.target.value)} maxLength={4} inputMode="numeric" aria-label="Time" />
    </>
  );
}

const option = (value: string, label = value) => ({ value, label });

export function BookingsView() {
  const dispatch = useAppDispatch();
  const now = useAppSelector((st) => st.fleet.now);
  const drivers = useAppSelector((st) => st.fleet.drivers.entities);
  const [query, setQuery] = useState(emptyQuery);
  const set: Setter<BookingQuery> = (key, value) => setQuery((q) => ({ ...q, [key]: value }));
  const search = useApi((api) => api.searchBookings(query), { auto: true, deps: [query.page] });
  const result = search.data;
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const goTo = (page: number) => setQuery((q) => ({ ...q, page }));

  const columns: FieldDef<BookingQuery>[][] = [
    [
      { label: "From", render: (q) => <DateTime now={now} date={q.from} time={q.fromTime} onDate={(v) => set("from", v)} onTime={(v) => set("fromTime", v)} /> },
      { label: "To", render: (q) => <DateTime now={now} date={q.to} time={q.toTime} onDate={(v) => set("to", v)} onTime={(v) => set("toTime", v)} /> },
      { label: "Job #", key: "jobNumber", placeholder: "Job #" },
      { label: "Source", key: "source", options: [option("ALL"), option("PHONE"), option("APP"), option("WEB")] },
      { label: "Site", key: "siteId", options: [option("ALL", "ALL SITES"), ...SITES.map((x) => option(x.id, x.name))] },
    ],
    [
      { label: "Drv ref", key: "driver" },
      { label: "Addr", key: "address" },
      { label: "Dest", key: "destination" },
      { label: "Acc", key: "account" },
    ],
    [
      { label: "Cust name", key: "customerName" },
      { label: "Cust ph", key: "customerPhone" },
      { label: "Status", key: "status", options: [option("ALL"), ...Object.keys(JOB_STATUS).map((k) => option(k))] },
      { label: "Keyword", key: "keyword" },
    ],
  ];

  const view = (job: Job) => {
    dispatch(jobSelected(job.id));
    dispatch(viewChanged("dispatch"));
  };
  const later = (what: string) => () => dispatch(toastShown({ tone: "info", text: `${what} is planned for a later phase` }));

  const tableCols: Column<Job>[] = [
    { key: "job", label: "Job #", width: "88px", render: (j) => j.number },
    { key: "route", label: "Route #", width: "60px", render: () => "-" },
    { key: "n", label: "N", width: "28px", render: (j) => (j.operatorNotes ? "N" : "") },
    { key: "op", label: "Op", width: "54px", render: (j) => j.createdBy.split(" ").map((p) => p[0]).join("").toUpperCase() },
    { key: "pickup", label: "Pickup", width: "84px", render: (j) => formatWhen(j.pickupAt, now) },
    { key: "status", label: "Status", width: "92px", render: (j) => JOB_STATUS[j.status].label },
    { key: "addr", label: "Addr", width: "1.4fr", render: (j) => `${j.pickup.label}, ${j.pickup.area}, ${j.pickup.postcode}`.toUpperCase() },
    { key: "dest", label: "Dest", width: "1.4fr", render: (j) => (j.dropoff ? `${j.dropoff.label}, ${j.dropoff.area}, ${j.dropoff.postcode}`.toUpperCase() : "") },
    { key: "drv", label: "Drv", width: "48px", render: (j) => (j.driverId ? drivers[j.driverId]?.callsign : "") },
    { key: "veh", label: "Veh", width: "50px", render: (j) => j.vehicle.slice(0, 3) },
    { key: "cust", label: "Cust", width: "1fr", render: (j) => j.customerName },
    { key: "site", label: "Site", width: "1fr", render: (j) => SITES.find((x) => x.id === j.siteId)?.name },
    { key: "phone", label: "Phone", width: "126px", render: (j) => formatPhone(j.phone) },
    { key: "calls", label: "Calls", width: "44px", align: "center", render: () => 0 },
    { key: "acc", label: "Acc", width: "0.8fr", render: (j) => j.accountCode ?? (j.payment === "CARD" ? "Passenger App Credit Card" : "") },
    { key: "pay", label: "Pay", width: "70px", render: (j) => (j.payment === "CASH" ? "CASH" : "INVOICE") },
    { key: "fare", label: "Fare", width: "70px", align: "right", render: (j) => (j.fare === null ? "" : formatMoney(j.fare)) },
    { key: "v", label: "V", width: "24px", render: () => "" },
    {
      key: "act",
      label: "Tab / Receipt / View",
      width: "190px",
      render: (j) => (
        <span className={s.rowButtons}>
          <Button size="sm" onClick={later("Tab")}>
            Tab
          </Button>
          <Button size="sm" onClick={later("Receipts")}>
            Receipt
          </Button>
          <Button size="sm" onClick={() => view(j)}>
            View
          </Button>
        </span>
      ),
    },
  ];

  const first = result ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const pageNumbers = Array.from({ length: Math.min(pages, 8) }, (_, i) => i + 1);

  return (
    <div className={s.view}>
      <Card title="Search">
        <div className={s.cardBody}>
          <QueryForm columns={columns} query={query} set={set} onSubmit={() => (query.page === 1 ? void search.run() : goTo(1))} />
          <div className={s.actions}>
            <Button className={s.wide} onClick={() => setQuery(emptyQuery())}>
              Clear form
            </Button>
            <span style={{ flex: 1 }} />
            <Button className={s.wide} onClick={() => (query.page === 1 ? void search.run() : goTo(1))} disabled={search.loading}>
              {search.loading ? "Searching..." : "Search"}
            </Button>
          </div>
          <div className={s.actions}>
            <p className={s.summary}>{result ? `Showing ${result.total ? first : 0} to ${Math.min(first + PAGE_SIZE - 1, result.total)} of ${result.total} Booking(s)` : " "}</p>
            <div className={s.pager}>
              {pageNumbers.map((n) => (
                <button key={n} type="button" className={s.pageBtn} aria-current={n === query.page ? "page" : undefined} onClick={() => goTo(n)}>
                  {n}
                </button>
              ))}
              <button type="button" className={s.pageBtn} disabled={query.page >= pages} onClick={() => goTo(query.page + 1)}>
                Next
              </button>
              <button type="button" className={s.pageBtn} disabled={query.page >= pages} onClick={() => goTo(pages)}>
                Last
              </button>
            </div>
          </div>
        </div>
      </Card>
      <div className={s.results}>
        <DataTable light wrap columns={tableCols} rows={result?.items ?? []} rowKey={(j) => j.id} empty={search.error ?? (search.loading ? "Searching..." : "No bookings match")} />
      </div>
    </div>
  );
}
