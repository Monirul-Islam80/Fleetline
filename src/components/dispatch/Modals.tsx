"use client";

import { useState } from "react";
import { KEYMAP } from "@/config/keymap";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { emptyVia, MAX_VIAS, optionsChanged, viaChanged, viaRemoved, viasReplaced, type ViaDraft } from "@/store/slices/bookingSlice";
import { modalOpened, toastShown } from "@/store/slices/uiSlice";
import type { BookingOptions } from "@/types/domain";
import { Button, Input, Toggle } from "../ui/controls";
import { Modal } from "../ui/overlays";
import { AddressInput } from "./AddressInput";
import { FormInput } from "./FormInput";
import s from "./modals.module.css";

/**
 * Via stops (F10): pickup, extra pickups or drops with their own passenger details, final drop.
 * Edits go straight into the booking form; Discard restores the stops as they were on open.
 */
function ViaModal() {
  const dispatch = useAppDispatch();
  const vias = useAppSelector((st) => st.booking.form.vias);
  const [original] = useState<ViaDraft[]>(vias);
  const close = () => dispatch(modalOpened(null));
  const discard = () => {
    dispatch(viasReplaced(original));
    close();
  };
  const patch = (index: number, field: keyof Pick<ViaDraft, "name" | "phone" | "notes">) => (e: React.ChangeEvent<HTMLInputElement>) =>
    dispatch(viaChanged({ index, patch: { [field]: e.target.value } }));
  const rows = vias.length ? vias : [emptyVia()];

  return (
    <Modal width={1300} onClose={discard}>
      <div className={s.viaHead}>
        <span />
        <span>#</span>
        <span>When</span>
        <span>Type</span>
        <span>Street</span>
        <span>Passengers</span>
        <span>Phone</span>
        <span>Account</span>
        <span>Driver notes</span>
        <span>Actions</span>
      </div>

      <div className={s.viaRow}>
        <span />
        <span className={s.num}>1.</span>
        <Input computed value="NOW" aria-label="When" />
        <Input computed value="PICKUP" aria-label="Type" />
        <AddressInput target="pickup" placeholder={`Street [${KEYMAP.pickup.hint}]`} />
        <FormInput field="name" placeholder="Name [F4]" />
        <FormInput field="phone" placeholder="Customer ph" />
        <FormInput field="account" placeholder="Acc" />
        <FormInput field="instructions" placeholder="Notes" />
        <span />
      </div>

      {rows.map((via, i) => (
        <div key={i} className={s.viaRow}>
          <span className={s.num}>⋮</span>
          <span className={s.num}>{i + 2}.</span>
          <Input computed value="N/A" aria-label="When" />
          <Input computed value="PICKUP" aria-label="Type" />
          <AddressInput target={i} placeholder={`Pickup ${i + 2}`} />
          <Input placeholder="Name" value={via.name} onChange={patch(i, "name")} />
          <Input placeholder="Phone" value={via.phone} onChange={patch(i, "phone")} />
          <Input disabled placeholder="Account" />
          <Input placeholder="Notes" value={via.notes} onChange={patch(i, "notes")} />
          <span className={s.actions}>
            <Button variant="danger" size="sm" icon="eraser" label="Remove this stop" onClick={() => dispatch(viaRemoved(i))} />
          </span>
        </div>
      ))}

      <div className={s.viaRow}>
        <span />
        <span className={s.num}>N/A</span>
        <Input computed value="N/A" aria-label="When" />
        <Input computed value="FINAL DEST" aria-label="Type" />
        <AddressInput target="dropoff" placeholder={`[${KEYMAP.destination.hint}]`} />
        <Input computed value="REMAINING PASSENGERS" aria-label="Passengers" />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className={s.foot}>
        <Button variant="primary" onClick={close}>
          Save &amp; close [F1]
        </Button>
        <Button disabled={vias.length >= MAX_VIAS} onClick={() => dispatch(viaChanged({ index: vias.length, patch: {} }))}>
          Add via [F3]
        </Button>
        <Button onClick={() => dispatch(toastShown({ tone: "info", text: "Route optimisation runs on the server in a later phase" }))}>Optimise route [F6]</Button>
        <Button variant="light" onClick={() => dispatch(toastShown({ tone: "info", text: "Split invoicing is planned for a later phase" }))}>
          Split invoice [F4]
        </Button>
        <Button onClick={discard}>Discard changes [Esc]</Button>
      </div>
    </Modal>
  );
}

const OPTIONS: { key: keyof BookingOptions; label: string; hint: string }[] = [
  { key: "sendSms", label: "Send SMS", hint: "Send SMS with this booking" },
  { key: "sendRingback", label: "Send ringback", hint: "Send RINGBACK with this booking" },
  { key: "autoComplete", label: "Auto complete", hint: "Automatically complete this booking" },
];

/** Booking options (list button): SMS, ringback, auto complete. Saved with the job. */
function OptionsModal() {
  const dispatch = useAppDispatch();
  const saved = useAppSelector((st) => st.booking.form.options);
  const [options, setOptions] = useState(saved);
  const close = () => dispatch(modalOpened(null));
  return (
    <Modal title="Booking options" width={1080} onClose={close}>
      <div className={s.options}>
        <span className={s.optLabel}>Instructions</span>
        <span className={s.optLabel} style={{ gridColumn: "span 2" }}>
          Please select options for booking
        </span>
        {OPTIONS.map((o) => (
          <div key={o.key} style={{ display: "contents" }}>
            <span className={s.optLabel}>{o.label}</span>
            <span>
              <Toggle className={s.optToggle} on={options[o.key]} onChange={(on) => setOptions({ ...options, [o.key]: on })}>
                {o.label}
              </Toggle>
            </span>
            <span className={s.optHint}>{o.hint}</span>
          </div>
        ))}
        <span>
          <Button
            style={{ width: 180 }}
            onClick={() => {
              dispatch(optionsChanged(options));
              close();
            }}
          >
            Save
          </Button>
        </span>
        <span className={s.optHint} style={{ gridColumn: "span 2" }}>
          To cancel, press the ESC key
        </span>
      </div>
    </Modal>
  );
}

export function Modals() {
  const modal = useAppSelector((st) => st.ui.modal);
  if (modal === "via") return <ViaModal />;
  if (modal === "options") return <OptionsModal />;
  return null;
}
