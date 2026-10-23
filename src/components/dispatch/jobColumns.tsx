import { VEHICLES } from "@/config/app";
import { JOB_STATUS } from "@/config/status";
import { formatHhmm, formatMoney } from "@/lib/format";
import { ZONES, zoneName } from "@/mock/geography";
import type { Driver, Job } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Chip, Dot } from "../ui/controls";
import type { Column } from "../ui/DataTable";
import s from "./dispatch.module.css";

/** What a job row needs besides the job itself. Built once per render of the grid. */
export interface JobRowContext {
  drivers: Record<string, Driver | undefined>;
  now: number;
}

function updateText(job: Job, drivers: JobRowContext["drivers"]): string {
  if (job.status === "NEW") {
    if (job.offer) return `OFFER ${drivers[job.offer.driverId]?.callsign ?? ""}`;
    if (job.designatedDriverId) return "DESIGNATED";
    const missed = job.missedBy[job.missedBy.length - 1];
    return missed ? `${missed} MISSED` : "N/A";
  }
  if (job.status === "PAUSED" && job.designatedDriverId) return "DESIGNATED";
  return JOB_STATUS[job.status].label;
}

function InfoChips({ job }: { job: Job }) {
  return (
    <span className={s.info}>
      {!job.isAsap && <Chip tone="yellow" title="Pre-booked">P</Chip>}
      {job.source === "APP" && <Chip>APP</Chip>}
      {job.source === "WEB" && <Chip title="Web booking">@</Chip>}
      {job.source === "PHONE" && (
        <Chip title="Phone booking">
          <Icon name="phone" size={12} />
        </Chip>
      )}
      {job.flightNo && <Chip title="Flight">{job.flightNo}</Chip>}
      {job.fare !== null && <Chip title={job.fareOverridden ? "Fixed fare" : "Fare"}>{formatMoney(job.fare)}</Chip>}
      {job.fare !== null && job.payment !== "CASH" && (
        <Chip tone="cyan" title="Driver price">
          {formatMoney(job.fare)}
        </Chip>
      )}
      {job.passengers > 1 && <Chip>#{job.passengers} PPL</Chip>}
      {job.dropoff && <Chip>{job.dropoff.area.toUpperCase()}</Chip>}
    </span>
  );
}

const zoneTag = (zoneId: string | null) => ZONES.find((z) => z.id === zoneId)?.tag ?? "";
const upper = (text: string) => text.toUpperCase();

/** The dispatch grid, column by column. Header, width and cell rendering in one place. */
export function jobColumns({ drivers, now }: JobRowContext, hideZones: boolean): Column<Job>[] {
  const cols: Column<Job>[] = [
    {
      key: "time",
      label: "Time",
      width: "70px",
      render: (j) => formatHhmm(j.pickupAt),
      cellClass: (j) => (j.pickupAt < now && (j.status === "NEW" || j.status === "PAUSED" || j.status === "BIDDING") ? `${s.timeCell} ${s.overdue}` : s.timeCell),
    },
    { key: "v", label: "V", width: "34px", align: "center", render: (j) => VEHICLES[j.vehicle].code },
    { key: "c", label: "C", width: "32px", align: "center", render: (j) => (j.options.sendSms ? <Dot title="Customer notified" /> : null) },
    {
      key: "n",
      label: "N",
      width: "44px",
      render: (j) => (
        <>
          {j.designatedDriverId && <Chip title="Designated driver">D</Chip>}
          {j.operatorNotes && <Chip title={j.operatorNotes}>O</Chip>}
        </>
      ),
    },
    { key: "priority", label: "P", width: "34px", align: "center", render: (j) => j.priority },
    { key: "status", label: "Update", width: "112px", render: (j) => updateText(j, drivers) },
    {
      key: "drv",
      label: "Drv",
      width: "56px",
      align: "right",
      render: (j) => {
        const id = j.driverId ?? j.designatedDriverId ?? j.offer?.driverId;
        const callsign = id ? drivers[id]?.callsign : undefined;
        return callsign ? <Chip tone="blue">{callsign}</Chip> : null;
      },
    },
    { key: "info", label: "Info", width: "minmax(170px, 1.3fr)", render: (j) => <InfoChips job={j} /> },
    { key: "pickup", label: "Pickup", width: "minmax(160px, 1.6fr)", render: (j) => upper(`${j.pickup.label}, ${j.pickup.area}`) },
    { key: "acc", label: "Acc", width: "minmax(60px, 0.6fr)", render: (j) => (j.accountCode ?? (j.payment === "CARD" ? "Passenger App Card" : "")) },
    { key: "dropoff", label: "Dest", width: "minmax(130px, 1.3fr)", render: (j) => (j.dropoff ? upper(`${j.dropoff.label}, ${j.dropoff.area}`) : "AS DIRECTED") },
    { key: "name", label: "Name", width: "minmax(80px, 0.8fr)", render: (j) => j.customerName },
    { key: "phone", label: "Phone", width: "112px", render: (j) => j.phone.replace(/\s/g, "") },
    { key: "zone", label: "Zone", width: "minmax(80px, 0.7fr)", render: (j) => upper(zoneName(j.pickup.zoneId)) },
    { key: "tags", label: "Zone Tags", width: "80px", render: (j) => zoneTag(j.pickup.zoneId) },
  ];
  return hideZones ? cols.filter((c) => c.key !== "zone" && c.key !== "tags") : cols;
}

/** Header keys that sort the grid (they match SortKey in uiSlice). */
export const SORTABLE = ["time", "priority", "status", "pickup", "dropoff", "name", "zone"] as const;

