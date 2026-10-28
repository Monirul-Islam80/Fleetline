import type { Place, Stop } from "@/types/domain";

export function toStop(place: Place): Stop {
  return { label: place.label, area: place.area, postcode: place.postcode, zoneId: place.zoneId, lat: place.lat, lng: place.lng };
}

/** "Crawley Station, Crawley" */
export const stopText = (stop: Stop): string => `${stop.label}, ${stop.area}`;
