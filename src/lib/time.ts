import { APP } from "@/config/app";
import type { Millis } from "@/types/domain";

/**
 * Operators may sit in another time zone (the audit saw a UTC+6 team), so every typed time
 * is read as fleet wall-clock time, never the browser's.
 */
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP.fleetTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function fleetWallClock(at: Millis): WallClock {
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(partsFormat.formatToParts(at).find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function offsetMs(at: Millis): number {
  const w = fleetWallClock(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(at / 60_000) * 60_000;
}

export interface FleetDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Reads what an operator types in the date box: empty or "today", "tomorrow" / "tmr",
 * "+2" (days ahead), "dd/mm" or "dd/mm/yyyy". Returns null when it cannot be read.
 */
export function parseFleetDate(text: string, now: Millis): FleetDate | null {
  const today = fleetWallClock(now);
  const t = text.trim().toLowerCase();
  const plusDays = (n: number): FleetDate => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + n));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  };
  if (!t || t === "today") return plusDays(0);
  if (t === "tomorrow" || t === "tmr") return plusDays(1);
  const plus = /^\+(\d{1,2})$/.exec(t);
  if (plus) return plusDays(Number(plus[1]));
  const dm = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.year;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Fleet wall-clock date + time to an epoch. */
export function fleetTimeToEpoch(date: FleetDate, hour: number, minute: number): Millis {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  return guess - offsetMs(guess);
}


/** Start and end (inclusive) of a fleet calendar day. Accepts typed date text or any time on that day. */
export function fleetDayRange(day: string | Millis, now: Millis): { start: Millis; end: Millis } | null {
  const date = typeof day === "number" ? fleetWallClock(day) : parseFleetDate(day, now);
  if (!date) return null;
  const start = fleetTimeToEpoch(date, 0, 0);
  return { start, end: fleetTimeToEpoch(date, 23, 59) + 59_999 };
}

/** dd/mm/yyyy for a fleet day, used when the calendar picks a date. */
export function fleetDateText(at: Millis): string {
  const w = fleetWallClock(at);
  return `${String(w.day).padStart(2, "0")}/${String(w.month).padStart(2, "0")}/${w.year}`;
}

export function fleetDateParts(at: Millis): FleetDate {
  const { year, month, day } = fleetWallClock(at);
  return { year, month, day };
}
