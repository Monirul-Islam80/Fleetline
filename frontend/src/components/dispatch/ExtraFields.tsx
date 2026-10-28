"use client";

import { formatDayShort, formatHhmm } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { MAX_VIAS } from "@/store/slices/bookingSlice";
import { resolvePickupAt } from "@/store/thunks/booking";
import { fieldChanged } from "@/store/slices/bookingSlice";
import { Input, Label, TextArea } from "../ui/controls";
import { AddressInput } from "./AddressInput";
import { FormInput } from "./FormInput";
import s from "./dispatch.module.css";

/** The extra booking fields that take the map's place (orange button). Same form state, more fields. */
export function ExtraFields() {
  const dispatch = useAppDispatch();
  const form = useAppSelector((st) => st.booking.form);
  const now = useAppSelector((st) => st.fleet.now);
  const at = resolvePickupAt(form, now) ?? now;

  return (
    <section className={s.card} aria-label="More booking fields">
      <div className={s.extras}>
        <Label>Appt:</Label>
        <div className={s.row}>
          <Input computed value={form.date ? form.date.toUpperCase() : "TODAY"} aria-label="Appointment date" />
          <Input computed value={formatDayShort(at)} aria-label="Appointment day" />
          <Input computed value={form.time ? form.time : formatHhmm(at)} aria-label="Appointment time" />
        </div>
        <div className={s.rule} />
        {Array.from({ length: MAX_VIAS }, (_, i) => (
          <div key={i} style={{ display: "contents" }}>
            <Label>Via{i + 1}:</Label>
            <div className={s.row}>
              <AddressInput target={i} placeholder={`Pickup ${i + 2}`} />
            </div>
          </div>
        ))}
        <div className={s.rule} />
        <Label>Alt phone:</Label>
        <div className={s.row}>
          <FormInput field="altPhone" type="tel" placeholder="Customer phone" />
        </div>
        <Label>C.notes:</Label>
        <div className={s.row}>
          <FormInput field="customerNotes" placeholder="Customer notes" />
        </div>
        <div className={s.rule} />
        <Label>Exc driver:</Label>
        <div className={s.row}>
          <FormInput field="excludeDrivers" placeholder="Exclude driver(s)" title="Callsigns separated by commas" />
        </div>
        <Label>Notes:</Label>
        <div className={s.row}>
          <TextArea
            rows={3}
            placeholder="OPERATOR NOTES (PRIVATE)"
            value={form.operatorNotes}
            onChange={(e) => dispatch(fieldChanged({ field: "operatorNotes", value: e.target.value }))}
          />
        </div>
      </div>
    </section>
  );
}
