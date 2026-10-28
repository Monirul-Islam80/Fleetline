import type { LatLng, Site, Tariff, VehicleType } from "@/types/domain";

/** Tenant settings. One place to rebrand the console for another fleet. */
export const APP = {
  product: "Fleetline",
  fleetName: "Western Cars",
  operator: { name: "Demo Operator", extension: "239" },
  fleetTimeZone: "Europe/London",
  locale: "en-GB",
  currency: "GBP",
  mapCentre: { lat: 51.125, lng: -0.03 } satisfies LatLng,
  mapZoom: 13,
  defaultLeadMin: 15,
  windowOptions: [1, 2, 4, 8, 24] as const,
  /** "mock" runs on seeded data in the browser; "live" calls NEXT_PUBLIC_API_URL. */
  apiMode: (process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock") as "mock" | "live",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  /** Socket that pushes RealtimeBatch messages (see store/actions.ts). Next rewrites don't proxy WebSockets, so this points at the API directly. */
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/api/v1/ws",
} as const;

export const SITES: readonly Site[] = [
  { id: "wc", name: "Western Cars" },
  { id: "wc-eg", name: "Western Cars East Grinstead" },
  { id: "wc-cr", name: "Western Cars Crawley" },
  { id: "wc-hh", name: "Western Cars Haywards Heath" },
  { id: "wc-fr", name: "Western Cars Forest Row" },
  { id: "wc-hl", name: "Western Cars Horley" },
  { id: "wc-hs", name: "Western Cars Horsham" },
  { id: "wc-br", name: "Western Cars Brighton" },
];

/** Placeholder engine tuning. Nothing here exists once the real backend is connected. */
export const SIM = {
  tickMs: 1000,
  speedFactor: 8,
  carSpeedMps: 11,
  offerTimeoutMs: 12_000,
  maxMissesBeforeBidding: 3,
  acceptProbability: 0.72,
  arrivedRadiusM: 60,
  droppingRadiusM: 450,
  waitAtPickupMs: 6_000,
  appBookingEveryMs: 40_000,
  noShowProbability: 0.03,
} as const;

export const VEHICLES: Record<VehicleType, { label: string; code: string; seats: number }> = {
  SALOON: { label: "Saloon", code: "", seats: 4 },
  ESTATE: { label: "Estate", code: "E", seats: 4 },
  MPV: { label: "MPV 6", code: "M6", seats: 6 },
  EXEC: { label: "Executive", code: "X1", seats: 4 },
  WAV: { label: "Wheelchair", code: "W", seats: 4 },
};

export const VEHICLE_OPTIONS = Object.entries(VEHICLES).map(([value, v]) => ({ value: value as VehicleType, label: v.label }));

export const TARIFFS: readonly Tariff[] = [
  { id: "standard", label: "Standard", base: 3.5, perMile: 2.2, minimum: 6 },
  { id: "large", label: "Large car", base: 4.5, perMile: 2.75, minimum: 8 },
  { id: "exec", label: "Executive", base: 6, perMile: 3.4, minimum: 12 },
];
