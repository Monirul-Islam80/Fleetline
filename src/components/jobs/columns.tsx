import type { ReactNode } from "react";
import { VEHICLES } from "@/config/app";
import { formatFleetTime, formatMoney, maskPhone } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import type { SortKey } from "@/store/slices/uiSlice";
import type { BookingSource, Driver, Job } from "@/types/domain";
import type { IconName } from "../ui/Icon";
import { CallsignChip, JobStatusPill, Tag } from "../ui/primitives";
import s from "./jobs.module.css";

export interface CellContext {
  driver: Driver | undefined;
  designated: Driver | undefined;
  offerTo: Driver | undefined;
  overdue: boolean;
  minutesToPickup: number;
}

export interface Column {
  id: string;
  label: string;
  width: string;
  sort?: SortKey;
  align?: "right";
  render: (job: Job, ctx: CellContext) => ReactNode;
}

const SOURCE: Record<BookingSource, { icon: IconName; label: string }> = {
  PHONE: { icon: "phone", label: "Phone" },
  APP: { icon: "sparkle", label: "App" },
  WEB: { icon: "map", label: "Web" },
};

function statusLabel(job: Job, ctx: CellContext): string | undefined {
  if (job.status !== "NEW") return undefined;
  if (ctx.offerTo) return `Offered to ${ctx.offerTo.callsign}`;
  if (ctx.designated) return `Waiting for ${ctx.designated.callsign}`;
  return "Finding a car";
}

function relative(min: number): string {
  if (min === 0) return "now";
  if (Math.abs(min) >= 120) return "";
  return min > 0 ? `in ${min}m` : `${-min}m late`;
}

/** The one column definition used by the header and every row. Add or reorder columns here. */
export const COLUMNS: readonly Column[] = [
  {
    id: "time",
    label: "Pickup",
    width: "104px",
    sort: "time",
    render: (job, ctx) => (
      <span className={ctx.overdue ? s.overdue : undefined}>
        <span className={s.time}>{formatFleetTime(job.pickupAt)}</span>
        <span className={s.timeSub}>{relative(ctx.minutesToPickup)}</span>
      </span>
    ),
  },
  {
    id: "status",
    label: "Status",
    width: "184px",
    sort: "status",
    render: (job, ctx) => (
      <span className={s.statusCell}>
        <JobStatusPill status={job.status} label={statusLabel(job, ctx)} />
        {job.missedBy.length > 0 && (job.status === "NEW" || job.status === "BIDDING") && (
          <span className={s.missed} title={`Missed by ${job.missedBy.join(", ")}`}>
            {job.missedBy.length} missed
          </span>
        )}
      </span>
    ),
  },
  {
    id: "driver",
    label: "Car",
    width: "64px",
    sort: "driver",
    render: (_job, ctx) => {
      const d = ctx.driver ?? ctx.offerTo;
      return d ? <CallsignChip callsign={d.callsign} status={d.status} /> : <span className={s.muted}>None</span>;
    },
  },
  {
    id: "info",
    label: "Details",
    width: "170px",
    render: (job) => (
      <span className={s.badges}>
        <Tag icon={SOURCE[job.source].icon} title={`Booked by ${SOURCE[job.source].label.toLowerCase()}`}>
          {SOURCE[job.source].label}
        </Tag>
        <Tag icon="users" title={`${job.passengers} passengers`}>
          {job.passengers}
        </Tag>
        {job.accountCode && <Tag title={`Account ${job.accountCode}`}>Acct</Tag>}
        {job.flightNo && <Tag icon="plane">{job.flightNo}</Tag>}
        {job.isRecurring && <Tag icon="repeat" title="Recurring booking">Repeat</Tag>}
        {job.instructions && <Tag icon="message" title={job.instructions}>Note</Tag>}
      </span>
    ),
  },
  {
    id: "pickup",
    label: "From",
    width: "minmax(170px, 1.3fr)",
    sort: "pickup",
    render: (job) => (
      <span title={`${job.pickup.label}, ${job.pickup.area}`}>
        <span className={s.place}>{job.pickup.label}</span>
        <span className={s.area}>{job.pickup.area}</span>
      </span>
    ),
  },
  {
    id: "dropoff",
    label: "To",
    width: "minmax(150px, 1.2fr)",
    sort: "dropoff",
    render: (job) =>
      job.dropoff ? (
        <span title={`${job.dropoff.label}, ${job.dropoff.area}`}>
          <span className={s.place}>{job.dropoff.label}</span>
          <span className={s.area}>{job.dropoff.area}</span>
        </span>
      ) : (
        <span className={s.muted}>As directed</span>
      ),
  },
  { id: "name", label: "Passenger", width: "minmax(110px, 0.8fr)", sort: "name", render: (job) => job.customerName },
  { id: "phone", label: "Phone", width: "116px", render: (job) => <span className={s.muted}>{job.phone ? maskPhone(job.phone) : "None"}</span> },
  {
    id: "fare",
    label: "Fare",
    width: "72px",
    sort: "fare",
    align: "right",
    render: (job) => (job.fare !== null ? formatMoney(job.fare) : <span className={s.muted}>Meter</span>),
  },
  { id: "vehicle", label: "Vehicle", width: "84px", render: (job) => <span className={s.muted}>{VEHICLES[job.vehicle].label}</span> },
  { id: "zone", label: "Zone", width: "112px", sort: "zone", render: (job) => <span className={s.muted}>{zoneName(job.pickup.zoneId)}</span> },
  { id: "priority", label: "Pri", width: "44px", sort: "priority", align: "right", render: (job) => job.priority },
];

export const GRID_TEMPLATE = COLUMNS.map((c) => c.width).join(" ");
