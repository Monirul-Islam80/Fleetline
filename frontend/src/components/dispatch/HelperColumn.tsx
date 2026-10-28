"use client";

import { KEYMAP } from "@/config/keymap";
import { formatMoney } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectDriverLists, selectFormQuote, selectNearestForForm } from "@/store/selectors";
import { fieldChanged, tariffSelected } from "@/store/slices/bookingSlice";
import { driverFocused } from "@/store/slices/uiSlice";
import type { Driver, TariffId } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { Callsign, Input, Label } from "../ui/controls";
import s from "./dispatch.module.css";

const TARIFF_KEYS: Record<TariffId, string> = { standard: KEYMAP.tariff1.hint, large: KEYMAP.tariff2.hint, exec: KEYMAP.tariff3.hint };

/** ETA box plus two computed readouts: nearest free car and its distance. */
function EtaRow() {
  const nearest = useAppSelector(selectNearestForForm);
  return (
    <div className={s.etaRow}>
      <Input placeholder={nearest ? String(nearest.etaMin) : "0"} aria-label="ETA quoted to caller (minutes)" title="ETA quoted to the caller, in minutes" inputMode="numeric" />
      <Input computed value={nearest ? `CAR ${nearest.driver.callsign}` : ""} aria-label="Nearest free car" />
      <Input computed value={nearest ? `${nearest.etaMin} MIN` : ""} aria-label="Nearest car ETA" title={nearest ? `${nearest.miles.toFixed(1)} miles away` : undefined} />
    </div>
  );
}

function DriverList({ title, drivers, full }: { title: string; drivers: Driver[]; full?: boolean }) {
  const dispatch = useAppDispatch();
  return (
    <div className={`${s.listCol} ${full ? s.full : ""}`}>
      <div className={s.listHead}>
        ({drivers.length}) {title}
      </div>
      <div className={s.listBody}>
        {drivers.map((d) => (
          <button key={d.id} type="button" title={`${d.name}, ${zoneName(d.zoneId)}`} onClick={() => dispatch(driverFocused(d.id))}>
            <Callsign value={d.callsign} />
          </button>
        ))}
      </div>
    </div>
  );
}

function FarePanel() {
  const dispatch = useAppDispatch();
  const quote = useAppSelector(selectFormQuote);
  const fareText = useAppSelector((st) => st.booking.form.fareText);
  const tariff = useAppSelector((st) => st.booking.form.tariff);
  const error = useAppSelector((st) => st.booking.errors.fareText);
  const selected = quote?.quotes.find((q) => q.tariffId === tariff);
  const rows = quote?.quotes ?? (["standard", "large", "exec"] as const).map((id) => ({ tariffId: id, label: "", price: 0 }));

  return (
    <section className={`${s.card} ${s.fare}`} aria-label="Fare">
      <div className={s.fareRow}>
        <Label htmlFor="fare">Fare:</Label>
        <Input
          id="fare"
          highlight
          placeholder={selected ? selected.price.toFixed(2) : "0.00"}
          value={fareText}
          error={error}
          inputMode="decimal"
          onChange={(e) => dispatch(fieldChanged({ field: "fareText", value: e.target.value.replace(/[^\d.]/g, "") }))}
        />
      </div>
      {rows.map((q) => (
        <button key={q.tariffId} type="button" className={s.quote} disabled={!quote} aria-pressed={quote ? q.tariffId === tariff && !fareText : undefined} onClick={() => dispatch(tariffSelected(q.tariffId))}>
          <span className={s.quoteMark}>
            <Icon name={quote ? "check" : "x"} size={11} strokeWidth={3} />
          </span>
          <b>{formatMoney(q.price)}</b> {quote ? q.label.toUpperCase() : "N/A"} ({TARIFF_KEYS[q.tariffId]})
        </button>
      ))}
    </section>
  );
}

/** Middle column: ETA, driver queues (parked, dropping, available to bid) and the fare. */
export function HelperColumn() {
  const lists = useAppSelector(selectDriverLists);
  return (
    <div className={s.helper}>
      <section className={s.card} aria-label="Driver availability" style={{ gridRow: "1 / 3" }}>
        <EtaRow />
        <div className={s.lists}>
          <DriverList title="Parked" drivers={lists.parked} />
          <DriverList title="Dropping" drivers={lists.dropping} />
          <DriverList title="Available for bid" drivers={lists.bidding} full />
        </div>
      </section>
      <FarePanel />
    </div>
  );
}
