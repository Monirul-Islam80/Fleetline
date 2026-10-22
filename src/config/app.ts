import type { LatLng, Tariff, VehicleType } from "@/types/domain";

/** Tenant and product settings. One place to rebrand the demo for another fleet. */
export const APP = {
  product: "Fleetline",
  fleetName: "Western Cars",
  operator: { name: "Demo operator", extension: "101" },
  fleetTimeZone: "Europe/London",
  locale: "en-GB",
  currency: "GBP",
  mapCentre: { lat: 51.118, lng: -0.06 } satisfies LatLng,
  mapZoom: 12,
  defaultLeadMin: 15,
  /** Look-ahead options for the pre-booked window, in hours. */
  windowOptions: [1, 2, 4, 8, 24] as const,
} as const;

/** Simulation tuning. All placeholder behaviour lives behind these numbers. */
export const SIM = {
  tickMs: 1000,
  /** Cars move this many times faster than real time so trips finish during a pitch. */
  speedFactor: 8,
  carSpeedMps: 11,
  offerTimeoutMs: 12_000,
  maxMissesBeforeBidding: 3,
  acceptProbability: 0.72,
  arrivedRadiusM: 60,
  droppingRadiusM: 450,
  waitAtPickupMs: 6_000,
  demoBookingEveryMs: 25_000,
  noShowProbability: 0.03,
} as const;

export const VEHICLES: Record<VehicleType, { label: string; seats: number }> = {
  SALOON: { label: "Saloon", seats: 4 },
  ESTATE: { label: "Estate", seats: 4 },
  MPV: { label: "MPV", seats: 6 },
  EXEC: { label: "Executive", seats: 4 },
  WAV: { label: "Wheelchair", seats: 4 },
};

export const VEHICLE_OPTIONS = Object.entries(VEHICLES).map(([value, v]) => ({
  value: value as VehicleType,
  label: v.label,
}));

export const TARIFFS: readonly Tariff[] = [
  { id: "standard", label: "Standard", base: 3.5, perMile: 2.2, minimum: 6 },
  { id: "large", label: "Large car", base: 4.5, perMile: 2.75, minimum: 8 },
  { id: "exec", label: "Executive", base: 6, perMile: 3.4, minimum: 12 },
];
