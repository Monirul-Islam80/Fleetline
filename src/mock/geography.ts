import type { Place, Zone } from "@/types/domain";

/**
 * Public places only (stations, hospitals, high streets). Coordinates are approximate and
 * postcodes are district level. No home addresses appear in demo data.
 */
export const ZONES: readonly Zone[] = [
  { id: "eg", name: "East Grinstead", lat: 51.1255, lng: -0.011, radiusM: 2200, tag: "local", surge: false, fullyBooked: false },
  { id: "cd", name: "Crawley Down", lat: 51.1206, lng: -0.078, radiusM: 1500, tag: "local", surge: false, fullyBooked: false },
  { id: "fb", name: "Felbridge", lat: 51.138, lng: -0.035, radiusM: 1200, tag: "local", surge: false, fullyBooked: false },
  { id: "lf", name: "Lingfield", lat: 51.174, lng: -0.009, radiusM: 1800, tag: "local", surge: false, fullyBooked: false },
  { id: "fr", name: "Forest Row", lat: 51.0975, lng: 0.0335, radiusM: 1500, tag: "local", surge: false, fullyBooked: false },
  { id: "aw", name: "Ashurst Wood", lat: 51.11, lng: 0.027, radiusM: 1000, tag: "local", surge: false, fullyBooked: false },
  { id: "th", name: "Turners Hill", lat: 51.103, lng: -0.087, radiusM: 1000, tag: "local", surge: false, fullyBooked: false },
  { id: "wh", name: "West Hoathly", lat: 51.079, lng: -0.056, radiusM: 1200, tag: "outer", surge: false, fullyBooked: false },
  { id: "cp", name: "Copthorne", lat: 51.14, lng: -0.107, radiusM: 1300, tag: "outer", surge: false, fullyBooked: false },
  { id: "cr", name: "Crawley", lat: 51.113, lng: -0.185, radiusM: 3000, tag: "outer", surge: false, fullyBooked: false },
  { id: "gw", name: "Gatwick", lat: 51.158, lng: -0.17, radiusM: 1800, tag: "airport", surge: false, fullyBooked: false },
  { id: "hh", name: "Haywards Heath", lat: 51.003, lng: -0.1, radiusM: 2200, tag: "outer", surge: false, fullyBooked: false },
  { id: "ld", name: "Lindfield", lat: 51.014, lng: -0.079, radiusM: 1000, tag: "outer", surge: false, fullyBooked: false },
];

export const PLACES: readonly Place[] = [
  { id: "p01", label: "East Grinstead Station", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1265, lng: -0.0178 },
  { id: "p02", label: "Queen Victoria Hospital", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1403, lng: -0.0062 },
  { id: "p03", label: "High Street", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1229, lng: -0.0063 },
  { id: "p04", label: "Chequer Mead Theatre", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1222, lng: -0.0094 },
  { id: "p05", label: "Kings Centre", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1247, lng: -0.0128 },
  { id: "p06", label: "Imberhorne School", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1292, lng: -0.0331 },
  { id: "p07", label: "Sackville School", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1183, lng: 0.0008 },
  { id: "p08", label: "East Court", area: "East Grinstead", postcode: "RH19", zoneId: "eg", lat: 51.1285, lng: 0.0012 },
  { id: "p09", label: "Village centre", area: "Crawley Down", postcode: "RH10", zoneId: "cd", lat: 51.1206, lng: -0.078 },
  { id: "p10", label: "Felbridge Hotel", area: "Felbridge", postcode: "RH19", zoneId: "fb", lat: 51.1383, lng: -0.0312 },
  { id: "p11", label: "Lingfield Station", area: "Lingfield", postcode: "RH7", zoneId: "lf", lat: 51.1765, lng: -0.007 },
  { id: "p12", label: "Lingfield Park Racecourse", area: "Lingfield", postcode: "RH7", zoneId: "lf", lat: 51.1705, lng: -0.0135 },
  { id: "p13", label: "Forest Row Square", area: "Forest Row", postcode: "RH18", zoneId: "fr", lat: 51.0977, lng: 0.0339 },
  { id: "p14", label: "Ashurst Wood village", area: "Ashurst Wood", postcode: "RH19", zoneId: "aw", lat: 51.1103, lng: 0.0262 },
  { id: "p15", label: "Turners Hill crossroads", area: "Turners Hill", postcode: "RH10", zoneId: "th", lat: 51.1032, lng: -0.0868 },
  { id: "p16", label: "Kingscote Station", area: "West Hoathly", postcode: "RH19", zoneId: "wh", lat: 51.1047, lng: -0.0492 },
  { id: "p17", label: "West Hoathly village", area: "West Hoathly", postcode: "RH19", zoneId: "wh", lat: 51.0786, lng: -0.0563 },
  { id: "p18", label: "Copthorne village", area: "Copthorne", postcode: "RH10", zoneId: "cp", lat: 51.1398, lng: -0.1072 },
  { id: "p19", label: "Three Bridges Station", area: "Crawley", postcode: "RH10", zoneId: "cr", lat: 51.1169, lng: -0.1612 },
  { id: "p20", label: "Crawley Station", area: "Crawley", postcode: "RH10", zoneId: "cr", lat: 51.1123, lng: -0.1866 },
  { id: "p21", label: "County Mall", area: "Crawley", postcode: "RH10", zoneId: "cr", lat: 51.1112, lng: -0.1832 },
  { id: "p22", label: "Crawley Hospital", area: "Crawley", postcode: "RH11", zoneId: "cr", lat: 51.1163, lng: -0.1958 },
  { id: "p23", label: "Gatwick South Terminal", area: "Gatwick", postcode: "RH6", zoneId: "gw", lat: 51.1565, lng: -0.161 },
  { id: "p24", label: "Gatwick North Terminal", area: "Gatwick", postcode: "RH6", zoneId: "gw", lat: 51.162, lng: -0.177 },
  { id: "p25", label: "Haywards Heath Station", area: "Haywards Heath", postcode: "RH16", zoneId: "hh", lat: 51.0055, lng: -0.105 },
  { id: "p26", label: "Princess Royal Hospital", area: "Haywards Heath", postcode: "RH16", zoneId: "hh", lat: 51.0042, lng: -0.0877 },
  { id: "p27", label: "The Orchards", area: "Haywards Heath", postcode: "RH16", zoneId: "hh", lat: 51.0003, lng: -0.1012 },
  { id: "p28", label: "Lindfield High Street", area: "Lindfield", postcode: "RH16", zoneId: "ld", lat: 51.014, lng: -0.0789 },
];

export const placeById = (id: string): Place | undefined => PLACES.find((p) => p.id === id);

export const zoneName = (id: string | null): string => ZONES.find((z) => z.id === id)?.name ?? "Out of area";
