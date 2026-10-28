"use client";

import { useRef, useState } from "react";
import { TERMINAL } from "@/config/status";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { copyJobToForm } from "@/store/thunks/booking";
import { assignJob, runJobAction } from "@/store/thunks/jobActions";
import { Button, Input } from "../ui/controls";
import { useDismiss } from "../ui/overlays";
import s from "./jobMenu.module.css";

export interface MenuState {
  jobId: string;
  x: number;
  y: number;
}

/** Right-click menu on a job row: the operator actions, each one an API call. */
export function JobMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const job = useAppSelector((st) => st.jobs.entities[menu.jobId]);
  const ref = useRef<HTMLDivElement>(null);
  const [callsign, setCallsign] = useState("");
  const [error, setError] = useState<string>();
  useDismiss(ref, onClose);
  if (!job) return null;

  const done = TERMINAL.has(job.status);
  const act = (action: Parameters<typeof runJobAction>[1]) => () => {
    void dispatch(runJobAction(job.id, action));
    onClose();
  };
  const allocate = async () => {
    const result = await dispatch(assignJob(job.id, callsign));
    if (result) setError(result);
    else onClose();
  };
  const items: { label: string; run: () => void; show: boolean; danger?: boolean }[] = [
    { label: "Pause", run: act("pause"), show: job.status === "NEW" || job.status === "BIDDING" },
    { label: "Resume dispatch", run: act("resume"), show: job.status === "PAUSED" },
    { label: "Re-dispatch", run: act("redispatch"), show: ["ENROUTE", "ARRIVED", "BIDDING"].includes(job.status) },
    {
      label: "Copy to form",
      run: () => {
        dispatch(copyJobToForm(job));
        onClose();
      },
      show: true,
    },
    { label: "No show", run: act("noshow"), show: job.status === "ARRIVED" || job.status === "ENROUTE", danger: true },
    { label: "Cancel job", run: act("cancel"), show: !done, danger: true },
  ];

  return (
    <div ref={ref} className={s.menu} style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 300) }} role="menu">
      <div className={s.title}>Job {job.number}</div>
      {!done && job.status !== "POB" && job.status !== "DROPPINGOFF" && (
        <div className={s.allocate}>
          <Input
            placeholder="Callsign"
            value={callsign}
            error={error}
            inputMode="numeric"
            autoFocus
            onChange={(e) => {
              setCallsign(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => e.key === "Enter" && void allocate()}
          />
          <Button variant="primary" onClick={() => void allocate()} disabled={!callsign.trim()}>
            Allocate
          </Button>
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}
      {items
        .filter((i) => i.show)
        .map((i) => (
          <button key={i.label} type="button" role="menuitem" className={i.danger ? `${s.item} ${s.danger}` : s.item} onClick={i.run}>
            {i.label}
          </button>
        ))}
    </div>
  );
}
