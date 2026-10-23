"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import { fleetDateParts, type FleetDate } from "@/lib/time";
import { Icon } from "./Icon";
import s from "./calendar.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Month grid for picking a booking date. Weeks start on Monday, as in the UK. */
export function Calendar({ value, today, onPick }: { value: FleetDate | null; today: number; onPick: (date: FleetDate) => void }) {
  const now = fleetDateParts(today);
  const [view, setView] = useState({ year: value?.year ?? now.year, month: value?.month ?? now.month });
  const first = new Date(Date.UTC(view.year, view.month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  };
  const same = (d: FleetDate | null, day: number) => d?.year === view.year && d.month === view.month && d.day === day;

  return (
    <div className={s.calendar} onMouseDown={(e) => e.preventDefault()}>
      <div className={s.head}>
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
          <Icon name="chevronLeft" size={15} strokeWidth={2.5} />
        </button>
        <span>
          {MONTHS[view.month - 1]} {view.year}
        </span>
        <button type="button" aria-label="Next month" onClick={() => shift(1)}>
          <Icon name="chevronRight" size={15} strokeWidth={2.5} />
        </button>
      </div>
      <div className={s.grid}>
        {DAYS.map((d) => (
          <span key={d} className={s.dow}>
            {d}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <span key={`b${i}`} />
          ) : (
            <button
              key={day}
              type="button"
              className={cx(s.day, same(now, day) && s.today, same(value, day) && s.selected)}
              onClick={() => onPick({ year: view.year, month: view.month, day })}
            >
              {day}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
