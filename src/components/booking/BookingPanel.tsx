"use client";

import { memo, useCallback, useEffect } from "react";
import { VEHICLE_OPTIONS } from "@/config/app";
import { KEYMAP } from "@/config/keymap";
import { focusTarget } from "@/lib/focusRegistry";
import { formatFleetDay, formatFleetTime } from "@/lib/format";
import { parseFleetDate } from "@/lib/time";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectCaller } from "@/store/selectors";
import { formReset, stopsSwapped, vehicleChanged } from "@/store/slices/bookingSlice";
import { lookupCaller, resolvePickupAt, saveBooking } from "@/store/thunks/booking";
import type { VehicleType } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/primitives";
import { SelectField, TextField } from "../ui/TextField";
import { AddressField } from "./AddressField";
import { BookingInput } from "./BookingInput";
import s from "./booking.module.css";

/** Read-only summary of when the car is due, so a wrong date or time is obvious at a glance. */
function DayReadout() {
  const form = useAppSelector((st) => st.booking.form);
  const now = useAppSelector((st) => st.fleet.now);
  let value: string;
  if (!form.date.trim() && !form.time.trim()) value = "As soon as possible";
  else {
    const at = resolvePickupAt(form, now);
    if (at === null) value = parseFleetDate(form.date, now) ? "Add a valid time" : "Check the date";
    else {
      const day = formatFleetDay(at);
      value = `${day === formatFleetDay(now) ? "Today" : day}, ${formatFleetTime(at)}`;
    }
  }
  return <TextField label="Car due" value={value} readOnly computed tabIndex={-1} />;
}

function VehicleSelect() {
  const dispatch = useAppDispatch();
  const vehicle = useAppSelector((st) => st.booking.form.vehicle);
  return (
    <SelectField
      label="Vehicle"
      value={vehicle}
      options={VEHICLE_OPTIONS}
      onChange={(e) => dispatch(vehicleChanged(e.target.value as VehicleType))}
    />
  );
}

function CallerBadge() {
  const caller = useAppSelector(selectCaller);
  if (!caller) return null;
  return (
    <span className={s.caller}>
      <Icon name="user" size={12} />
      Known caller, {caller.tripCount} trips{caller.accountCode ? `, account ${caller.accountCode}` : ""}
    </span>
  );
}

const SwapButton = memo(function SwapButton() {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      className={s.iconBtn}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => dispatch(stopsSwapped())}
      aria-label="Swap pickup and destination"
      title="Swap pickup and destination"
    >
      <Icon name="swap" size={14} />
    </button>
  );
});

export function BookingPanel() {
  const dispatch = useAppDispatch();
  const resetCount = useAppSelector((st) => st.booking.resetCount);
  const onPhoneChange = useCallback(() => dispatch(lookupCaller()), [dispatch]);

  // After a save or clear, put the cursor back on the phone field for the next call.
  useEffect(() => {
    if (resetCount > 0) focusTarget("phone");
  }, [resetCount]);

  const save = () => {
    dispatch(saveBooking());
  };

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <h1 className={s.title}>New booking</h1>
        <CallerBadge />
        <span className={s.spacer} />
        <Button size="sm" variant="ghost" icon="x" kbd={KEYMAP.clear.hint} onClick={() => dispatch(formReset())}>
          Clear
        </Button>
      </div>

      {/* Not a <form>: Enter must never save by accident. Saving is F1 or the button. */}
      <div className={s.body}>
        <div className={s.grid}>
          <BookingInput className={s.s1} field="date" label="Date" placeholder="Today" maxLength={10} />
          <BookingInput className={s.s1} field="time" label="Time" placeholder="Now" title="24-hour time, e.g. 1430" inputMode="numeric" maxLength={5} />
          <div className={s.s2}>
            <DayReadout />
          </div>
          <BookingInput className={s.s1} field="leadMin" label="Lead min" title={KEYMAP.lead.label + " (" + KEYMAP.lead.hint + ")"} inputMode="numeric" focus="lead" />
          <BookingInput className={s.s1} field="priority" label="Priority" inputMode="numeric" maxLength={1} />

          <BookingInput
            className={s.s3}
            field="phone"
            label="Phone"
            kbd={KEYMAP.phone.hint}
            focus="phone"
            type="tel"
            placeholder="Caller number"
            onAfterChange={onPhoneChange}
            autoFocus
          />
          <BookingInput className={s.s3} field="name" label="Passenger name" kbd={KEYMAP.name.hint} focus="name" placeholder="Full name" />

          <AddressField className={s.s6} kind="pickup" label="Pickup" kbd={KEYMAP.pickup.hint} focus="pickup" placeholder="Street, place or postcode" />
          <AddressField
            className={s.s4}
            kind="dropoff"
            label="Destination"
            kbd={KEYMAP.destination.hint}
            focus="dropoff"
            placeholder="Where to"
            adornment={<SwapButton />}
          />
          <AddressField className={s.s2} kind="via" label="Via" kbd={KEYMAP.via.hint} focus="via" placeholder="Add a stop" />

          <BookingInput className={s.s1} field="passengers" label="Pax" inputMode="numeric" maxLength={2} />
          <div className={s.s2}>
            <VehicleSelect />
          </div>
          <BookingInput className={s.s1} field="taxis" label="Cars" inputMode="numeric" maxLength={2} />
          <BookingInput className={s.s2} field="driverCallsign" label="Request driver" placeholder="Callsign" inputMode="numeric" maxLength={4} />

          <BookingInput className={s.s4} field="instructions" label="Note to driver" placeholder="Gate code, luggage, child seat" />
          <BookingInput className={s.s1} field="account" label="Account" placeholder="Code" />
          <BookingInput className={s.s1} field="pin" label="PIN" inputMode="numeric" maxLength={6} />
        </div>
      </div>

      <div className={s.foot}>
        <span className={s.footNote}>Leave time empty to dispatch now. Fare and nearest driver update as you type.</span>
        <span className={s.spacer} />
        <Button variant="primary" size="lg" icon="check" kbd={KEYMAP.save.hint} onClick={save}>
          Save job
        </Button>
      </div>
    </div>
  );
}
