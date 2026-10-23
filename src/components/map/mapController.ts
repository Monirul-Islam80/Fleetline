import L from "leaflet";
import { APP } from "@/config/app";
import { DRIVER_STATUS, JOB_STATUS } from "@/config/status";
import { formatFleetTime } from "@/lib/format";
import type { DriverTrack } from "@/types/api";
import type { Driver, Job, LatLng, Zone } from "@/types/domain";

export type BaseLayer = "map" | "satellite";

const TILES: Record<BaseLayer, { url: string; attribution: string }> = {
  map: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const TRACK_COLOURS = ["#2563eb", "#dc3b3b", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

/**
 * All Leaflet code lives here. React hands in data; this class diffs it onto layers, so a
 * once-a-second position update moves markers without React rendering anything per car.
 * Used by the dispatch map and the playback map.
 */
export class MapController {
  private readonly map: L.Map;
  private tiles: L.TileLayer;
  private readonly layers = { zones: L.layerGroup(), route: L.layerGroup(), pickups: L.layerGroup(), drivers: L.layerGroup(), tracks: L.layerGroup() };
  private readonly markers = new Map<string, { marker: L.Marker; key: string }>();
  private zonesKey = "";

  constructor(container: HTMLElement, private readonly onDriverClick?: (id: string) => void) {
    this.map = L.map(container, { center: [APP.mapCentre.lat, APP.mapCentre.lng], zoom: APP.mapZoom, zoomControl: false });
    this.map.attributionControl.setPrefix(false);
    this.tiles = this.makeTiles("map").addTo(this.map);
    Object.values(this.layers).forEach((layer) => layer.addTo(this.map));
  }

  private makeTiles(layer: BaseLayer): L.TileLayer {
    return L.tileLayer(TILES[layer].url, { attribution: TILES[layer].attribution, subdomains: "abcd", maxZoom: 19 });
  }

  setBaseLayer(layer: BaseLayer): void {
    this.tiles.remove();
    this.tiles = this.makeTiles(layer).addTo(this.map);
    this.tiles.bringToBack();
  }

  syncDrivers(drivers: readonly Driver[], focusedId: string | null = null): void {
    const seen = new Set<string>();
    for (const d of drivers) {
      seen.add(d.id);
      const tone = DRIVER_STATUS[d.status].tone;
      const focused = d.id === focusedId;
      const key = `${tone}|${focused}`;
      const existing = this.markers.get(d.id);
      if (existing) {
        existing.marker.setLatLng([d.lat, d.lng]);
        if (existing.key !== key) {
          existing.marker.setIcon(this.chip(d.callsign, tone, focused)).setZIndexOffset(focused ? 1000 : 0);
          existing.key = key;
        }
        continue;
      }
      const marker = L.marker([d.lat, d.lng], { icon: this.chip(d.callsign, tone, focused), keyboard: false })
        .bindTooltip(() => `<b>${esc(d.callsign)}</b> ${esc(d.name)}<br>${esc(DRIVER_STATUS[d.status].label)}`, { direction: "top", offset: [0, -12] })
        .on("click", () => this.onDriverClick?.(d.id))
        .addTo(this.layers.drivers);
      this.markers.set(d.id, { marker, key });
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.marker.remove();
        this.markers.delete(id);
      }
    }
  }

  /** Waiting jobs as pickup diamonds, so demand shows against supply. */
  syncPickups(jobs: readonly Job[]): void {
    this.layers.pickups.clearLayers();
    for (const job of jobs) {
      L.circleMarker([job.pickup.lat, job.pickup.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#ef8a17", fillOpacity: 1 })
        .bindTooltip(`${formatFleetTime(job.pickupAt)} ${esc(JOB_STATUS[job.status].label)}<br>${esc(job.pickup.label)}`, { direction: "top" })
        .addTo(this.layers.pickups);
    }
  }

  syncZones(zones: readonly Zone[], visible: boolean, labels = false): void {
    const key = `${visible}|${labels}|${zones.map((z) => `${z.id}${z.surge ? 1 : 0}${z.fullyBooked ? 1 : 0}`).join()}`;
    if (key === this.zonesKey) return;
    this.zonesKey = key;
    this.layers.zones.clearLayers();
    if (!visible) return;
    for (const z of zones) {
      const flagged = z.surge || z.fullyBooked;
      L.circle([z.lat, z.lng], { radius: z.radiusM, color: flagged ? "#ef8a17" : "#4b5a73", weight: 1.5, fillOpacity: flagged ? 0.15 : 0.06, interactive: false }).addTo(this.layers.zones);
      if (labels) L.marker([z.lat, z.lng], { icon: L.divIcon({ className: "", html: `<span class="zone-label">${esc(z.name.toUpperCase())}</span>`, iconSize: [0, 0] }), interactive: false }).addTo(this.layers.zones);
    }
  }

  /** Selected job: car to pickup solid, pickup to drop-off dashed. */
  showRoute(job: Job | null, driver: Driver | null): void {
    this.layers.route.clearLayers();
    if (!job) return;
    const stops: L.LatLngTuple[] = [job.pickup, ...job.vias, ...(job.dropoff ? [job.dropoff] : [])].map((p) => [p.lat, p.lng]);
    if (stops.length > 1) L.polyline(stops, { color: "#2563eb", weight: 4, dashArray: "8 6" }).addTo(this.layers.route);
    if (driver) L.polyline([[driver.lat, driver.lng], [job.pickup.lat, job.pickup.lng]], { color: "#16a34a", weight: 4 }).addTo(this.layers.route);
    stops.forEach((p, i) => L.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: i === 0 ? "#16a34a" : "#2563eb", fillOpacity: 1 }).addTo(this.layers.route));
    const all = driver ? [...stops, [driver.lat, driver.lng] as L.LatLngTuple] : stops;
    this.map.flyToBounds(L.latLngBounds(all), { padding: [50, 50], maxZoom: 15, duration: 0.5 });
  }

  showTracks(tracks: readonly DriverTrack[]): void {
    this.layers.tracks.clearLayers();
    tracks.forEach((t, i) => {
      const colour = TRACK_COLOURS[i % TRACK_COLOURS.length] ?? "#2563eb";
      const line = t.points.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      L.polyline(line, { color: colour, weight: 3 }).bindTooltip(t.callsign).addTo(this.layers.tracks);
      const last = line[line.length - 1];
      if (last) L.marker(last, { icon: this.chip(t.callsign, "enroute", false), keyboard: false }).addTo(this.layers.tracks);
    });
  }

  flyTo(point: LatLng, zoom = 15): void {
    this.map.flyTo([point.lat, point.lng], Math.max(zoom, this.map.getZoom()), { duration: 0.5 });
  }

  fitDrivers(): void {
    const points = [...this.markers.values()].map((m) => m.marker.getLatLng());
    if (points.length) this.map.flyToBounds(L.latLngBounds(points), { padding: [30, 30], duration: 0.5 });
  }

  setView(centre: LatLng, zoom: number): void {
    this.map.setView([centre.lat, centre.lng], zoom);
  }

  zoom(delta: 1 | -1): void {
    if (delta > 0) this.map.zoomIn();
    else this.map.zoomOut();
  }

  onClick(handler: (point: LatLng) => void): void {
    this.map.on("click", (e: L.LeafletMouseEvent) => handler({ lat: e.latlng.lat, lng: e.latlng.lng }));
  }

  invalidateSize(): void {
    this.map.invalidateSize();
  }

  destroy(): void {
    this.map.remove();
    this.markers.clear();
  }

  private chip(callsign: string, tone: string, focused: boolean): L.DivIcon {
    return L.divIcon({ className: "drv", html: `<span class="drv-chip${focused ? " is-focused" : ""}" data-tone="${tone}">${esc(callsign)}</span>`, iconSize: [0, 0] });
  }
}
