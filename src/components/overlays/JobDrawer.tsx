"use client";

import { Fragment, useState } from "react";
import { VEHICLES } from "@/config/app";
import { formatFleetDay, formatFleetTime, formatMoney } from "@/lib/format";
import { stopText } from "@/lib/stops";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isOverdue, selectJobEvents } from "@/store/selectors";
import { driverFocused } from "@/store/slices/uiSlice";
import { duplicateIntoForm } from "@/store/thunks/booking";
import { assignJob, cancelJob, markNoShow, pauseJob, redispatchJob, resumeJob } from "@/store/thunks/jobActions";
import type { Job } from "@/types/domain";
import { Button, CallsignChip, JobStatusPill } from "../ui/primitives";
import { TextField } from "../ui/TextField";
import { DrawerShell } from "./DrawerShell";
import s from "./overlays.module.css";

const TERMINAL = new Set(["COMPLETED", "CANCELLED", "NOSHOW"]);

function Facts({ job }: { job: Job }) {
  const dispatch = useAppDispatch();
  const now = useAppSelector((st) => st.fleet.now);
  const driver = useAppSelector((st) => (job.driverId ? st.fleet.drivers.entities[job.driverId] : undefined));
  const designated = useAppSelector((st) => (job.designatedDriverId ? st.fleet.drivers.entities[job.designatedDriverId] : undefined));

  return (
    <dl className={s.facts}>
      <dt>Pickup time</dt>
      <dd style={isOverdue(job, now) ? { color: "var(--tone-problem)", fontWeight: 600 } : undefined}>
        {formatFleetTime(job.pickupAt)} {formatFleetDay(job.pickupAt)}
        <span className={s.factSub}>{job.isAsap ? "As soon as possible" : `Released ${job.leadMin} min before`}</span>
      </dd>
      <dt>Passenger</dt>
      <dd>
        {job.customerName}
        <span className={s.factSub}>{job.phone || "No phone given"}</span>
      </dd>
      <dt>From</dt>
      <dd>
        {stopText(job.pickup)}
        <span className={s.factSub}>
          {job.pickup.postcode}, zone {zoneName(job.pickup.zoneId)}
        </span>
      </dd>
      {job.vias.map((v, i) => (
        <Fragment key={`${v.label}-${i}`}>
          <dt>Via</dt>
          <dd>{stopText(v)}</dd>
        </Fragment>
      ))}
      <dt>To</dt>
      <dd>{job.dropoff ? stopText(job.dropoff) : "As directed"}</dd>
      <dt>Car</dt>
      <dd>
        {driver ? (
          <button type="button" onClick={() => dispatch(driverFocused(driver.id))} title="Show on map">
            <CallsignChip callsign={driver.callsign} status={driver.status} /> {driver.name}
          </button>
        ) : designated ? (
          `Requested ${designated.callsign}, ${designated.name}`
        ) : (
          "Not assigned"
        )}
        {job.missedBy.length > 0 && <span className={s.factSub}>Missed by {job.missedBy.join(", ")}</span>}
      </dd>
      <dt>Trip</dt>
      <dd>
        {job.passengers} {job.passengers === 1 ? "passenger" : "passengers"}, {VEHICLES[job.vehicle].label.toLowerCase()}
        {job.flightNo && <span className={s.factSub}>Flight {job.flightNo}</span>}
      </dd>
      <dt>Fare</dt>
      <dd>
        {job.fare !== null ? formatMoney(job.fare) : "On the meter"}
        <span className={s.factSub}>
          {job.payment === "ACCOUNT" ? `Account ${job.accountCode ?? ""}` : job.payment === "CARD" ? "Card in app" : "Cash"}
          {job.fareOverridden ? ", set manually" : ""}
        </span>
      </dd>
      {job.instructions && (
        <>
          <dt>Note</dt>
          <dd>{job.instructions}</dd>
        </>
      )}
    </dl>
  );
}

function AssignForm({ job }: { job: Job }) {
  const dispatch = useAppDispatch();
  const [callsign, setCallsign] = useState("");
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    const result = dispatch(assignJob(job.id, callsign));
    setError(result ?? undefined);
    if (!result) setCallsign("");
  };
  return (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>Assign a car</h3>
      <div className={s.assign}>
        <TextField
          label="Callsign"
          inputMode="numeric"
          value={callsign}
          error={error}
          onChange={(e) => setCallsign(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button variant="primary" size="lg" onClick={submit} disabled={!callsign.trim()}>
          Assign
        </Button>
      </div>
    </div>
  );
}

function Timeline({ jobId }: { jobId: string }) {
  const events = useAppSelector((st) => selectJobEvents(st, jobId));
  if (!events.length) return null;
  return (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>History</h3>
      <ul className={s.timeline}>
        {events.map((e) => (
          <li key={e.id}>
            <time>{formatFleetTime(e.at)}</time>
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Actions({ job }: { job: Job }) {
  const dispatch = useAppDispatch();
  const [confirm, setConfirm] = useState<"cancel" | "noshow" | null>(null);
  if (TERMINAL.has(job.status)) {
    return (
      <Button icon="copy" onClick={() => dispatch(duplicateIntoForm(job))}>
        Book again
      </Button>
    );
  }
  const canPause = job.status === "NEW" || job.status === "BIDDING";
  const onTrip = job.status === "ENROUTE" || job.status === "ARRIVED";
  return (
    <>
      {canPause && (
        <Button icon="pause" onClick={() => dispatch(pauseJob(job.id))}>
          Pause
        </Button>
      )}
      {job.status === "PAUSED" && (
        <Button icon="play" onClick={() => dispatch(resumeJob(job.id))}>
          Resume
        </Button>
      )}
      {(onTrip || job.status === "BIDDING") && (
        <Button icon="refresh" onClick={() => dispatch(redispatchJob(job.id))}>
          Re-dispatch
        </Button>
      )}
      <Button icon="copy" onClick={() => dispatch(duplicateIntoForm(job))}>
        Copy to form
      </Button>
      {onTrip &&
        (confirm === "noshow" ? (
          <Button variant="danger" icon="check" onClick={() => dispatch(markNoShow(job.id))} onBlur={() => setConfirm(null)} autoFocus>
            Confirm no-show
          </Button>
        ) : (
          <Button icon="ban" onClick={() => setConfirm("noshow")}>
            No-show
          </Button>
        ))}
      {confirm === "cancel" ? (
        <Button variant="danger" icon="check" onClick={() => dispatch(cancelJob(job.id))} onBlur={() => setConfirm(null)} autoFocus>
          Confirm cancel
        </Button>
      ) : (
        <Button variant="danger" icon="x" onClick={() => setConfirm("cancel")}>
          Cancel job
        </Button>
      )}
    </>
  );
}

export function JobDrawer({ jobId }: { jobId: string }) {
  const job = useAppSelector((st) => st.jobs.entities[jobId]);
  if (!job) return null;
  const canAssign = !TERMINAL.has(job.status) && job.status !== "POB" && job.status !== "DROPPINGOFF";
  return (
    <DrawerShell title={`Job ${job.number}`} meta={<JobStatusPill status={job.status} />} footer={<Actions key={job.id} job={job} />}>
      <Facts job={job} />
      {canAssign && <AssignForm key={job.id} job={job} />}
      <Timeline jobId={job.id} />
    </DrawerShell>
  );
}
