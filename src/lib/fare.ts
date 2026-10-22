import { TARIFFS } from "@/config/app";
import type { FareQuote, LatLng } from "@/types/domain";
import { roadMiles } from "./geo";

const roundTo10p = (value: number): number => Math.round(value * 10) / 10;

/** Total road miles across pickup, vias and drop-off in order. */
export function routeMiles(points: readonly LatLng[]): number {
  let miles = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (prev && next) miles += roadMiles(prev, next);
  }
  return miles;
}

export function quoteFares(miles: number): FareQuote[] {
  return TARIFFS.map((t) => ({
    tariffId: t.id,
    label: t.label,
    price: roundTo10p(Math.max(t.minimum, t.base + t.perMile * miles)),
  }));
}
