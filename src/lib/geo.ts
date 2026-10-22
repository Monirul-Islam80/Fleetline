import type { LatLng } from "@/types/domain";

const EARTH_RADIUS_M = 6_371_000;
const METRES_PER_MILE = 1609.344;
/** Straight-line distance understates road distance; this factor is a fair UK suburban average. */
const ROAD_FACTOR = 1.3;
const AVG_ROAD_MPH = 24;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function roadMiles(a: LatLng, b: LatLng): number {
  return (distanceM(a, b) * ROAD_FACTOR) / METRES_PER_MILE;
}

export function etaMinutes(miles: number): number {
  return Math.max(1, Math.round((miles / AVG_ROAD_MPH) * 60));
}

/** Moves `from` towards `to` by `stepM` metres. Returns the target when within one step. */
export function stepTowards(from: LatLng, to: LatLng, stepM: number): LatLng {
  const total = distanceM(from, to);
  if (total <= stepM || total === 0) return { lat: to.lat, lng: to.lng };
  const t = stepM / total;
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
}

/** A random point within `radiusM` of `centre`. Uses the supplied random source for testability. */
export function jitter(centre: LatLng, radiusM: number, rand: () => number): LatLng {
  const r = radiusM * Math.sqrt(rand());
  const theta = rand() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111_320;
  const dLng = (r * Math.sin(theta)) / (111_320 * Math.cos(toRad(centre.lat)));
  return { lat: centre.lat + dLat, lng: centre.lng + dLng };
}

/** Returns the closest item to `point`, or null for an empty list. */
export function nearest<T extends LatLng>(point: LatLng, items: readonly T[]): { item: T; metres: number } | null {
  let best: { item: T; metres: number } | null = null;
  for (const item of items) {
    const metres = distanceM(point, item);
    if (!best || metres < best.metres) best = { item, metres };
  }
  return best;
}
