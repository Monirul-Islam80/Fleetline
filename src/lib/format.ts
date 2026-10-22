import { APP } from "@/config/app";
import type { Millis } from "@/types/domain";

const fleetTime = new Intl.DateTimeFormat(APP.locale, {
  timeZone: APP.fleetTimeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fleetTimeSeconds = new Intl.DateTimeFormat(APP.locale, {
  timeZone: APP.fleetTimeZone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const localTime = new Intl.DateTimeFormat(APP.locale, { hour: "2-digit", minute: "2-digit", hour12: false });

const fleetDay = new Intl.DateTimeFormat(APP.locale, {
  timeZone: APP.fleetTimeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const money = new Intl.NumberFormat(APP.locale, { style: "currency", currency: APP.currency });

export const formatFleetTime = (at: Millis): string => fleetTime.format(at);
export const formatFleetClock = (at: Millis): string => fleetTimeSeconds.format(at);
export const formatLocalTime = (at: Millis): string => localTime.format(at);
export const formatFleetDay = (at: Millis): string => fleetDay.format(at);
export const formatMoney = (value: number): string => money.format(value);

/** "4 min", "1 h 12 min" */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Shows the last 3 digits only, so a shared screen never exposes a full number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return `${digits.slice(0, 5)} ••• ${digits.slice(-3)}`;
}

export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
