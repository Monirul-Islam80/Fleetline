"use client";

import { useState, type ReactNode } from "react";
import { SITES, VEHICLE_OPTIONS } from "@/config/app";
import { DRIVER_STATUS } from "@/config/status";
import { formatFleetDate, formatFleetTime, formatPhone, formatWait } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectDriverLists, selectFlaggedZones, selectNowMinute } from "@/store/selectors";
import { staffRead } from "@/store/slices/inboxSlice";
import { demoFeedToggled, jobSelected, pauseToggled, replyStarted, sitesChanged, type PanelId } from "@/store/slices/uiSlice";
import { clearZoneFlags, closeChat, deleteAlert, loadSnapshot, sendBroadcast, sendStaffMessage, takeCall, takeChat } from "@/store/thunks/inbox";
import type { BroadcastInput } from "@/types/api";
import type { Alert, CallRequest, Driver, DriverChat, Zone } from "@/types/domain";
import { FlightList } from "../dispatch/JobsArea";
import { Button, Callsign, Input, Label, Select, TextArea } from "../ui/controls";
import { DataTable, type Column } from "../ui/DataTable";
import { FloatPanel } from "../ui/overlays";
import s from "./panels.module.css";

/* Every counter tab opens one of these. Each is a table or a form over data from the inbox slice. */

function PanelHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.panelHead}>
      <span className={s.panelTitle}>{title}</span>
      <span className={s.actionsCell}>{children}</span>
    </div>
  );
}

const small = (label: string, run: () => void, variant: "dark" | "danger" = "dark") => (
  <Button size="sm" variant={variant} onClick={run}>
    {label}
  </Button>
);

/* ---------- Staff messages ---------- */

function StaffPanel() {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((st) => st.inbox.staffMessages);
  const operators = useAppSelector((st) => st.inbox.operators);
  const [mode, setMode] = useState<"latest" | "new">("latest");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const send = async () => {
    if (await dispatch(sendStaffMessage(to.trim() || "All operators", body.trim()))) {
      setBody("");
      setMode("latest");
    }
  };
  return (
    <FloatPanel width={560}>
      <div className={s.links}>
        <button type="button" aria-current={mode === "latest"} onClick={() => setMode("latest")}>
          Latest messages
        </button>
        |
        <button type="button" aria-current={mode === "new"} onClick={() => setMode("new")}>
          New message [N]
        </button>
        |
        <button type="button" onClick={() => dispatch(staffRead(Date.now()))}>
          Mark all read [R]
        </button>
      </div>
      {mode === "latest" ? (
        <div className={s.messages}>
          {messages.map((m) => (
            <div key={m.id} className={s.message}>
              <div className={s.messageHead}>
                <span>Sent by: {m.from}</span>
                <span>
                  Date: {formatFleetTime(m.at)} {formatFleetDate(m.at)}
                </span>
              </div>
              {m.body}
            </div>
          ))}
        </div>
      ) : (
        <div className={s.form}>
          <Label htmlFor="staff-to">Recipient:</Label>
          <Input id="staff-to" list="operators" value={to} onChange={(e) => setTo(e.target.value)} placeholder="All operators" autoFocus />
          <datalist id="operators">
            {operators.map((o) => (
              <option key={o.id} value={o.name} />
            ))}
          </datalist>
          <Label htmlFor="staff-body">Message:</Label>
          <TextArea id="staff-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: "var(--font)" }} />
          <span />
          <Button variant="primary" disabled={!body.trim()} onClick={() => void send()}>
            Send message
          </Button>
        </div>
      )}
    </FloatPanel>
  );
}

/* ---------- Driver chat, call queue, alerts ---------- */

function ChatPanel() {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((st) => st.inbox.driverChats);
  const cols: Column<DriverChat>[] = [
    { key: "drv", label: "Drv", width: "56px", render: (c) => c.callsign },
    { key: "resp", label: "Response", width: "1.6fr", render: (c) => c.response },
    { key: "orig", label: "Orig. message", width: "1fr", render: (c) => c.original },
    { key: "mt", label: "Message time", width: "100px", render: (c) => formatFleetTime(c.messageAt) },
    { key: "rt", label: "Response time", width: "100px", render: (c) => formatFleetTime(c.responseAt) },
    {
      key: "act",
      label: "Take / Reply / Enquiry / Done",
      width: "290px",
      render: (c) => (
        <span className={s.actionsCell}>
          {c.takenBy ? <Button size="sm" disabled>Taken</Button> : small("Take", () => void dispatch(takeChat(c.id)))}
          {small("Reply", () => dispatch(replyStarted(c.callsign)))}
          {small("Enquiry", () => dispatch(replyStarted(c.callsign)))}
          {small("Done", () => void dispatch(closeChat(c.id)))}
        </span>
      ),
    },
  ];
  return (
    <FloatPanel width="min(980px, 100%)">
      <DataTable light wrap columns={cols} rows={chats} rowKey={(c) => c.id} empty="No driver messages waiting" />
    </FloatPanel>
  );
}

function CallsPanel() {
  const dispatch = useAppDispatch();
  const calls = useAppSelector((st) => st.inbox.callQueue);
  const cols: Column<CallRequest>[] = [
    { key: "type", label: "Type", width: "80px", render: () => "REGULAR" },
    { key: "pos", label: "Pos", width: "44px", render: (c) => c.position },
    { key: "drv", label: "Drv", width: "56px", render: (c) => c.callsign },
    { key: "phone", label: "Phone", width: "120px", render: (c) => <span style={{ color: "var(--danger)" }}>{c.phone.replace(/\s/g, "")}</span> },
    { key: "name", label: "Name", width: "1fr", render: (c) => c.name },
    { key: "booking", label: "Booking", width: "1.8fr", render: (c) => (c.booking ? <span style={{ background: "var(--dark)", color: "#fff", padding: "2px 6px", borderRadius: 3 }}>{c.booking}</span> : "N/A") },
    { key: "date", label: "Date", width: "60px", render: (c) => formatFleetTime(c.at) },
    {
      key: "act",
      label: "Enquiry",
      width: "150px",
      render: (c) => (
        <span className={s.actionsCell}>
          {small("Take", () => void dispatch(takeCall(c.id)))}
          {small("Enquiry", () => dispatch(replyStarted(c.callsign)))}
        </span>
      ),
    },
  ];
  return (
    <FloatPanel width="min(1000px, 100%)">
      <DataTable light wrap columns={cols} rows={calls} rowKey={(c) => c.id} empty="No drivers waiting for a call" />
    </FloatPanel>
  );
}

function AlertsPanel() {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector((st) => st.inbox.alerts);
  const cols: Column<Alert>[] = [
    { key: "date", label: "Date", width: "70px", render: (a) => formatFleetTime(a.at) },
    { key: "title", label: "Title", width: "150px", render: (a) => a.title },
    { key: "msg", label: "Message", width: "1fr", render: (a) => <span className={s.multiline}>{a.message}</span> },
    {
      key: "act",
      label: "Enquiry / Take / Reply / Delete",
      width: "280px",
      render: (a) => (
        <span className={s.actionsCell}>
          {a.callsign && small("Enquiry", () => dispatch(replyStarted(a.callsign ?? "")))}
          {a.jobId && small("Take", () => dispatch(jobSelected(a.jobId)))}
          {a.callsign && small("Reply", () => dispatch(replyStarted(a.callsign ?? "")))}
          {small("Del", () => void dispatch(deleteAlert(a.id)), "danger")}
        </span>
      ),
    },
  ];
  return (
    <FloatPanel width="min(900px, 100%)">
      <DataTable light wrap columns={cols} rows={alerts} rowKey={(a) => a.id} empty="No alerts" />
    </FloatPanel>
  );
}

/* ---------- Driver message (broadcast) ---------- */

function BroadcastPanel() {
  const dispatch = useAppDispatch();
  const replyTo = useAppSelector((st) => st.ui.replyTo);
  const [form, setForm] = useState<BroadcastInput>({
    audience: "ONLINE_APP",
    message: "",
    driver: replyTo,
    question: false,
    type: "INFO",
    lifetime: "20:00",
    zone: "",
    vehicle: "ANY",
    siteId: "ALL",
  });
  const set = <K extends keyof BroadcastInput>(key: K, value: BroadcastInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const send = async () => {
    if (await dispatch(sendBroadcast(form))) set("message", "");
  };
  return (
    <FloatPanel width={560}>
      <div className={s.form}>
        <Label>Options:</Label>
        <Select
          value={form.audience}
          onChange={(e) => set("audience", e.target.value as BroadcastInput["audience"])}
          options={[
            { value: "ONLINE_APP", label: "Online drivers via app" },
            { value: "ALL", label: "All drivers" },
            { value: "ZONE", label: "Drivers in a zone" },
          ]}
        />
        <Label>Message:</Label>
        <TextArea rows={5} value={form.message} onChange={(e) => set("message", e.target.value)} style={{ fontFamily: "var(--font)" }} autoFocus />
        <div className={s.formRule} />
        <Label>Driver:</Label>
        <Input value={form.driver} onChange={(e) => set("driver", e.target.value)} placeholder="Callsign, or leave empty" />
        <Label>Question:</Label>
        <Select value={form.question ? "YES" : "NO"} onChange={(e) => set("question", e.target.value === "YES")} options={[{ value: "NO", label: "NO" }, { value: "YES", label: "YES" }]} />
        <Label>Type:</Label>
        <Select
          value={form.type}
          onChange={(e) => set("type", e.target.value as BroadcastInput["type"])}
          options={[
            { value: "INFO", label: "INFO (Pops on screen, active for lifetime period)" },
            { value: "ALERT", label: "ALERT (Must be acknowledged)" },
          ]}
        />
        <Label>Lifetime:</Label>
        <Input value={form.lifetime} onChange={(e) => set("lifetime", e.target.value)} />
        <span className={s.hint}>Lifetime format: mm:ss</span>
        <div className={s.formRule} />
        <Label>Zone:</Label>
        <Input value={form.zone} onChange={(e) => set("zone", e.target.value)} />
        <Label>Veh. type:</Label>
        <Select value={form.vehicle} onChange={(e) => set("vehicle", e.target.value as BroadcastInput["vehicle"])} options={[{ value: "ANY", label: "Any vehicle" }, ...VEHICLE_OPTIONS]} />
        <Label>Site:</Label>
        <Select value={form.siteId} onChange={(e) => set("siteId", e.target.value)} options={[{ value: "ALL", label: "ALL SITES" }, ...SITES.map((x) => ({ value: x.id, label: x.name }))]} />
        <div className={s.formRule} />
        <span />
        <Button variant="primary" disabled={!form.message.trim()} onClick={() => void send()}>
          Send message [Alt+4]
        </Button>
      </div>
    </FloatPanel>
  );
}

/* ---------- Zones, inactive drivers, flights ---------- */

function ZonesPanel() {
  const dispatch = useAppDispatch();
  const zones = useAppSelector(selectFlaggedZones);
  const cols: Column<Zone>[] = [
    { key: "zone", label: "Zone", width: "1fr", render: (z) => z.name.toUpperCase() },
    { key: "flag", label: "Flag", width: "1fr", render: (z) => [z.surge && "SURGE", z.fullyBooked && "FULLY BOOKED"].filter(Boolean).join(", ") },
  ];
  return (
    <FloatPanel width={420}>
      <PanelHead title="Flagged zones">
        <Button size="sm" variant="danger" disabled={!zones.length} onClick={() => void dispatch(clearZoneFlags())}>
          Clear zones
        </Button>
      </PanelHead>
      <DataTable light columns={cols} rows={zones} rowKey={(z) => z.id} empty="No zones are flagged" />
    </FloatPanel>
  );
}

function InactivePanel() {
  const away = useAppSelector(selectDriverLists).away;
  const now = useAppSelector(selectNowMinute);
  const cols: Column<Driver>[] = [
    { key: "drv", label: "Drv", width: "56px", render: (d) => <Callsign value={d.callsign} /> },
    { key: "name", label: "Name", width: "1fr", render: (d) => d.name },
    { key: "status", label: "Status", width: "90px", render: (d) => DRIVER_STATUS[d.status].label },
    { key: "since", label: "For", width: "70px", render: (d) => formatWait(now - d.statusSince) },
    { key: "zone", label: "Last zone", width: "1fr", render: (d) => zoneName(d.zoneId).toUpperCase() },
    { key: "phone", label: "Phone", width: "130px", render: (d) => formatPhone(d.phone) },
  ];
  return (
    <FloatPanel width={680}>
      <PanelHead title="Drivers inactive" />
      <DataTable light columns={cols} rows={away} rowKey={(d) => d.id} empty="Every driver is active" />
    </FloatPanel>
  );
}

function FlightsPanel() {
  const flights = useAppSelector((st) => st.inbox.flights);
  return (
    <FloatPanel width="min(1100px, 100%)">
      <PanelHead title="Flight alerts" />
      <FlightList flights={flights} />
    </FloatPanel>
  );
}

/* ---------- Sites filter and settings ---------- */

function SitesPanel() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((st) => st.ui.siteIds);
  const all = selected.length === SITES.length;
  const toggle = (id: string) => dispatch(sitesChanged(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]));
  return (
    <FloatPanel width={300} style={{ left: 380, right: "auto", maxHeight: "100%" }}>
      <div className={s.sites}>
        <label>
          <input type="checkbox" checked={all} onChange={() => dispatch(sitesChanged(all ? [] : SITES.map((x) => x.id)))} /> All sites
        </label>
        {SITES.map((site) => (
          <label key={site.id}>
            <input type="checkbox" checked={selected.includes(site.id)} onChange={() => toggle(site.id)} /> {site.name}
          </label>
        ))}
      </div>
    </FloatPanel>
  );
}

function SettingsPanel() {
  const dispatch = useAppDispatch();
  const paused = useAppSelector((st) => st.ui.paused);
  const feed = useAppSelector((st) => st.ui.demoFeed);
  return (
    <FloatPanel width={320}>
      <PanelHead title="Demo settings" />
      <div className={s.settings}>
        <p>Data is placeholder until the backend is connected.</p>
        <Button onClick={() => dispatch(pauseToggled())}>{paused ? "Resume live updates" : "Pause live updates"}</Button>
        <Button onClick={() => dispatch(demoFeedToggled())}>{feed ? "Stop app booking feed" : "Start app booking feed"}</Button>
        <Button variant="danger" onClick={() => void dispatch(loadSnapshot())}>
          Reset demo data
        </Button>
      </div>
    </FloatPanel>
  );
}

const PANELS: Record<PanelId, () => ReactNode> = {
  staff: () => <StaffPanel />,
  zones: () => <ZonesPanel />,
  inactive: () => <InactivePanel />,
  calls: () => <CallsPanel />,
  chat: () => <ChatPanel />,
  broadcast: () => <BroadcastPanel />,
  alerts: () => <AlertsPanel />,
  flights: () => <FlightsPanel />,
  sites: () => <SitesPanel />,
  settings: () => <SettingsPanel />,
};

export function Panels() {
  const panel = useAppSelector((st) => st.ui.panel);
  const replyTo = useAppSelector((st) => st.ui.replyTo);
  if (!panel) return null;
  // Keyed so a new Reply starts a fresh form with the right callsign.
  return <div key={`${panel}-${replyTo}`} style={{ display: "contents" }}>{PANELS[panel]()}</div>;
}
