"use client";

import { memo, useMemo, useState } from "react";
import { DRIVER_STATUS } from "@/config/status";
import { KEYMAP } from "@/config/keymap";
import { registerFocus } from "@/lib/focusRegistry";
import { formatDuration, formatMoney } from "@/lib/format";
import { zoneName } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectDriverLists, selectFormQuote, selectNearestForForm } from "@/store/selectors";
import { fieldChanged, tariffSelected, viaRemoved } from "@/store/slices/bookingSlice";
import { driverFocused } from "@/store/slices/uiSlice";
import type { Driver, TariffId } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { CallsignChip, Empty, Kbd, SectionHead, Segmented } from "../ui/primitives";
import s from "./helper.module.css";

const TARIFF_KEYS: Record<TariffId, string> = {
  standard: KEYMAP.tariff1.hint,
  large: KEYMAP.tariff2.hint,
  exec: KEYMAP.tariff3.hint,
};

function NearestDriver() {
  const ranked = useAppSelector(selectNearestForForm);
  const hasPickup = useAppSelector((st) => st.booking.form.pickup !== null);
  const best = ranked[0];

  return (
    <div className={s.block}>
      <SectionHead title="Nearest free car now" />
      {!hasPickup && <p className={s.hint}>Enter a pickup to see the closest free car and its ETA.</p>}
      {hasPickup && !best && <p className={s.hint}>No free car seats this many passengers right now.</p>}
      {best && (
        <>
          <div className={s.nearest}>
            <span className={s.bigCallsign} data-tone={DRIVER_STATUS[best.driver.status].tone}>
              {best.driver.callsign}
            </span>
            <span className={s.eta}>
              {best.etaMin}
              <small>min away</small>
            </span>
            <span className={s.sub}>
              {best.miles.toFixed(1)} mi, {best.driver.name}, {best.driver.vehicle.toLowerCase()}
            </span>
          </div>
          {ranked.length > 1 && (
            <div className={s.runners}>
              Next
              {ranked.slice(1).map((r) => (
                <span key={r.driver.id} title={`${r.etaMin} min`}>
                  <CallsignChip callsign={r.driver.callsign} status={r.driver.status} /> {r.etaMin} min
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const fareRef = registerFocus("fare");

function FareMeter() {
  const dispatch = useAppDispatch();
  const quote = useAppSelector(selectFormQuote);
  const fareText = useAppSelector((st) => st.booking.form.fareText);
  const tariff = useAppSelector((st) => st.booking.form.tariff);
  const vias = useAppSelector((st) => st.booking.form.vias);
  const error = useAppSelector((st) => st.booking.errors.fareText);
  const selected = quote?.quotes.find((q) => q.tariffId === tariff);

  return (
    <div className={s.block}>
      <SectionHead title="Fare">{fareText && <span className={s.overridden}>Manual fare</span>}</SectionHead>
      <label className={s.meter}>
        <span className={s.currency}>£</span>
        <input
          ref={fareRef}
          className={selected ? `${s.meterInput} ${s.priced}` : s.meterInput}
          inputMode="decimal"
          aria-label="Fare in pounds"
          placeholder={selected ? selected.price.toFixed(2) : "0.00"}
          value={fareText}
          onChange={(e) => dispatch(fieldChanged({ field: "fareText", value: e.target.value.replace(/[^\d.]/g, "") }))}
        />
      </label>
      {error && <span className={s.fieldError}>{error}</span>}
      <div className={s.route}>
        {quote ? `${quote.miles.toFixed(1)} miles, about ${formatDuration(quote.durationMin * 60_000)} by road` : "Add pickup and destination to price the trip"}
      </div>
      {vias.length > 0 && (
        <div className={s.vias} aria-label="Via stops">
          {vias.map((v, i) => (
            <span key={`${v.label}-${i}`} className={s.viaChip}>
              Via {v.label}
              <button type="button" aria-label={`Remove via ${v.label}`} onClick={() => dispatch(viaRemoved(i))}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={s.tariffs} role="group" aria-label="Tariffs">
        {(quote?.quotes ?? []).map((q) => (
          <button key={q.tariffId} type="button" className={s.tariff} aria-pressed={q.tariffId === tariff && !fareText} onClick={() => dispatch(tariffSelected(q.tariffId))}>
            <span>{q.label}</span>
            <span className={s.tariffPrice}>{formatMoney(q.price)}</span>
            <Kbd>{TARIFF_KEYS[q.tariffId]}</Kbd>
          </button>
        ))}
      </div>
    </div>
  );
}

type QueueTab = "parked" | "available" | "dropping";

const QueueRow = memo(function QueueRow({ driver, index, now }: { driver: Driver; index: number; now: number }) {
  const dispatch = useAppDispatch();
  return (
    <li className={s.queueItem} onClick={() => dispatch(driverFocused(driver.id))} title="Show on map">
      <span className={s.queuePos}>{index + 1}</span>
      <CallsignChip callsign={driver.callsign} status={driver.status} />
      <span className={s.queueZone}>{zoneName(driver.zoneId)}</span>
      <span className={s.queueTime}>{formatDuration(now - driver.statusSince)}</span>
    </li>
  );
});

function DriverQueues() {
  const lists = useAppSelector(selectDriverLists);
  const now = useAppSelector((st) => Math.floor(st.fleet.now / 60_000) * 60_000);
  const [tab, setTab] = useState<QueueTab>("parked");
  const items = useMemo(
    () =>
      [
        { id: "parked", label: "Parked", count: lists.parked.length },
        { id: "available", label: "Free", count: lists.available.length },
        { id: "dropping", label: "Finishing", count: lists.dropping.length },
      ] as const,
    [lists],
  );
  const rows = lists[tab];

  return (
    <div className={s.queues}>
      <Segmented items={items} value={tab} onChange={setTab} ariaLabel="Driver queues" />
      {rows.length === 0 ? (
        <Empty title="Nobody here right now" />
      ) : (
        <ul className={s.queueList}>
          {rows.map((d, i) => (
            <QueueRow key={d.id} driver={d} index={i} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function HelperPanel() {
  return (
    <div className={s.panel}>
      <NearestDriver />
      <FareMeter />
      <DriverQueues />
    </div>
  );
}
