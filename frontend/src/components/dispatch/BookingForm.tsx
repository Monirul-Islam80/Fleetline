"use client";

import { useEffect, useRef, useState } from "react";
import { VEHICLE_OPTIONS } from "@/config/app";
import { KEYMAP } from "@/config/keymap";
import { focusTarget, registerFocus } from "@/lib/focusRegistry";
import { formatDayShort } from "@/lib/format";
import { fleetDateText, fleetTimeToEpoch, parseFleetDate } from "@/lib/time";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fieldChanged, formReset, stopsSwapped, vehicleChanged } from "@/store/slices/bookingSlice";
import { extrasToggled, modalOpened, toastShown } from "@/store/slices/uiSlice";
import { lookupCaller, saveBooking } from "@/store/thunks/booking";
import type { VehicleType } from "@/types/domain";
import { Calendar } from "../ui/Calendar";
import { Adornment, Button, Input, Label, Select } from "../ui/controls";
import { useDismiss } from "../ui/overlays";
import { AddressInput } from "./AddressInput";
import { FormInput } from "./FormInput";
import s from "./dispatch.module.css";

/** DATE: typed text ("today", "tomorrow", "24/10") or picked from the calendar that opens on focus. */
function DateRow() {
  const dispatch = useAppDispatch();
  const date = useAppSelector((st) => st.booking.form.date);
  const error = useAppSelector((st) => st.booking.errors.date);
  const now = useAppSelector((st) => st.fleet.now);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, () => setOpen(false), open);
  const parsed = parseFleetDate(date, now);

  return (
    <div className={s.row}>
      <div ref={wrap} className={s.w2} style={{ position: "relative" }}>
        <Input
          ref={registerFocus("date")}
          placeholder="Today"
          value={date}
          error={error}
          onFocus={() => setOpen(true)}
          onChange={(e) => dispatch(fieldChanged({ field: "date", value: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
        />
        {open && (
          <div className={s.popover}>
            <Calendar
              value={parsed}
              today={now}
              onPick={(d) => {
                dispatch(fieldChanged({ field: "date", value: fleetDateText(fleetTimeToEpoch(d, 12, 0)) }));
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
      <Input computed value={parsed ? formatDayShort(fleetTimeToEpoch(parsed, 12, 0)) : "CHECK DATE"} aria-label="Day" />
      <FormInput field="time" placeholder="Now" inputMode="numeric" maxLength={5} aria-label="Time" />
    </div>
  );
}

function VehicleSelect() {
  const dispatch = useAppDispatch();
  const vehicle = useAppSelector((st) => st.booking.form.vehicle);
  return <Select aria-label="Vehicle type" title="Vehicle type" value={vehicle} options={VEHICLE_OPTIONS} onChange={(e) => dispatch(vehicleChanged(e.target.value as VehicleType))} />;
}

function FormFooter() {
  const dispatch = useAppDispatch();
  const extras = useAppSelector((st) => st.ui.showExtras);
  return (
    <div className={s.formFoot}>
      <Button variant="light" label="Clear the form (F8)" onClick={() => dispatch(formReset())}>
        [F8]
      </Button>
      <Button className={s.dotBtn} icon="dot" label="More booking fields" aria-pressed={extras} onClick={() => dispatch(extrasToggled())} />
      <Button icon="list" label="Booking options" onClick={() => dispatch(modalOpened("options"))} />
      <Button icon="refresh" label={`Recurring booking (${KEYMAP.recurring.hint})`} onClick={() => dispatch(toastShown({ tone: "info", text: "Recurring bookings are planned for the next phase" }))} />
      <Button variant="primary" size="lg" className={s.save} onClick={() => void dispatch(saveBooking())}>
        Save Job [F1]
      </Button>
    </div>
  );
}

/** The booking form, laid out exactly like the console operators use today. */
export function BookingForm() {
  const dispatch = useAppDispatch();
  const resetCount = useAppSelector((st) => st.booking.resetCount);
  useEffect(() => {
    if (resetCount > 0) focusTarget("phone");
  }, [resetCount]);
  const onPhone = () => void dispatch(lookupCaller());

  return (
    <section className={s.card} aria-label="New booking">
      <div className={s.form}>
        <Label>Date:</Label>
        <DateRow />

        <Label>Ph:</Label>
        <div className={s.row}>
          <Button variant="light" icon="book" label="Caller history (double F4)" className={s.fixed} onClick={() => focusTarget("phone")} />
          <FormInput className={s.w3} field="phone" focus="phone" type="tel" placeholder={`Phone [${KEYMAP.phone.hint}]`} onAfterChange={onPhone} autoFocus />
          <FormInput field="priority" placeholder="Priority" inputMode="numeric" maxLength={1} />
        </div>
        <div className={s.rule} />

        <Label>Addr:</Label>
        <div className={s.row}>
          <AddressInput target="pickup" focus="pickup" placeholder={`Street [${KEYMAP.pickup.hint}]`} />
        </div>
        <Label>Dest:</Label>
        <div className={s.row}>
          <AddressInput
            className={s.w3}
            target="dropoff"
            focus="dropoff"
            placeholder={`[${KEYMAP.destination.hint}]`}
            adornment={<Adornment icon="swap" label="Swap pickup and destination" onClick={() => dispatch(stopsSwapped())} />}
          />
          <Button className={s.fixed} onClick={() => dispatch(modalOpened("via"))}>
            Via [{KEYMAP.via.hint}]
          </Button>
        </div>
        <div className={s.rule} />

        <Label>Name:</Label>
        <div className={s.row}>
          <FormInput className={s.w2} field="name" focus="name" placeholder={`Name [${KEYMAP.name.hint}]`} />
          <FormInput field="email" type="email" placeholder="Email" />
        </div>
        <Label>Inst:</Label>
        <div className={s.row}>
          <FormInput className={s.w2} field="instructions" aria-label="Instructions to driver" />
          <FormInput field="driverCallsign" placeholder="Driver ID" inputMode="numeric" maxLength={4} />
        </div>
        <Label>Acc:</Label>
        <div className={s.row}>
          <FormInput className={s.w2} field="account" placeholder="Acc" />
          <FormInput field="pin" placeholder="PIN" inputMode="numeric" maxLength={6} />
        </div>
        <Label>Ppl:</Label>
        <div className={s.row}>
          <FormInput field="passengers" placeholder="#PPL" inputMode="numeric" maxLength={2} />
          <FormInput field="taxis" placeholder="#TAXI" inputMode="numeric" maxLength={2} />
          <VehicleSelect />
          <FormInput field="extras" placeholder="Extra" />
          <FormInput className={s.w2} field="leadMin" focus="lead" placeholder={`Lead time [${KEYMAP.lead.hint}]`} inputMode="numeric" />
        </div>
        <div className={s.rule} />

        <Label>Site:</Label>
        <div className={s.row}>
          <FormInput field="site" placeholder="Site" />
        </div>
      </div>
      <FormFooter />
    </section>
  );
}
