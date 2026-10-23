import { APP } from "@/config/app";
import type { Millis } from "@/types/domain";

const fmt = (options: Intl.DateTimeFormatOptions, local = false) =>
  new Intl.DateTimeFormat(APP.locale, { ...(local ? {} : { timeZone: APP.fleetTimeZone }), hour12: false, ...options });

const fleetHm = fmt({ hour: "2-digit", minute: "2-digit" });
const localHm = fmt({ hour: "2-digit", minute: "2-digit" }, true);
const fleetWeekday = fmt({ weekday: "short" });
const fleetDayNum = fmt({ day: "numeric" });
const fleetDate = fmt({ day: "2-digit", month: "2-digit", year: "numeric" });
const money = new Intl.NumberFormat(APP.locale, { style: "currency", currency: APP.currency });

/** "23:46" in fleet (UK) time. */
export const formatFleetTime = (at: Millis): string => fleetHm.format(at);
/** "2346", the compact form the grid and time inputs use. */
export const formatHhmm = (at: Millis): string => fleetHm.format(at).replace(":", "");
/** Operator's own clock, for remote teams. */
export const formatLocalTime = (at: Millis): string => localHm.format(at);
/** "22/10/2026" */
export const formatFleetDate = (at: Millis): string => fleetDate.format(at);
export const formatMoney = (value: number): string => money.format(value);

const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (SUFFIX[n % 10] ?? "th")}`;

/** "FRI 23rd", the day readout next to the date field. */
export const formatDayShort = (at: Millis): string => `${fleetWeekday.format(at).toUpperCase()} ${ordinal(Number(fleetDayNum.format(at)))}`;
/** "FRI" */
export const formatWeekday = (at: Millis): string => fleetWeekday.format(at).toUpperCase();

/** "4h 51m", "0h 19m": the wait format used in queues. */
export function formatWait(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, "0")}m`;
}

/** "Today 23:59" or "22/10/2026 23:59" */
export function formatWhen(at: Millis, now: Millis): string {
  const sameDay = formatFleetDate(at) === formatFleetDate(now);
  return `${sameDay ? "Today" : formatFleetDate(at)} ${formatFleetTime(at)}`;
}

/** UK numbers as operators read them: 00447700900123. */
export const formatPhone = (phone: string): string => {
  const digits = digitsOnly(phone);
  return digits.startsWith("0") ? `0044${digits.slice(1)}` : digits;
};

export const digitsOnly = (value: string): string => value.replace(/\D/g, "");
