import L from "leaflet";
import { APP } from "@/config/app";
import { DRIVER_STATUS, JOB_STATUS } from "@/config/status";
import { formatFleetTime } from "@/lib/format";
import type { Driver, Job, LatLng, Zone } from "@/types/domain";
import type { Theme } from "@/store/slices/uiSlice";

const TILES: Record<Theme, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

interface DriverMarker {
  marker: L.Marker;
  key: string;
}

/**
 * Owns the Leaflet map. React passes data in; this class diffs it onto map layers so a
 * 1 Hz position update moves markers without React rendering anything per driver.
 */
export class MapController {
  private readonly map: L.Map;
  private tiles: L.TileLayer;
  private readonly driverLayer = L.layerGroup();
  private readonly zoneLayer = L.layerGroup();
  private readonly pickupLayer = L.layerGroup();
  private readonly routeLayer = L.layerGroup();
  private readonly markers = new Map<string, DriverMarker>();
  private readonly pickups = new Map<string, { marker: L.Marker; key: string }>();
  private zonesKey = "";

  constructor(container: HTMLElement, theme: Theme, onDriverClick: (id: string) => void, onPickupClick: (jobId: string) => void) {
    this.map = L.map(container, {
      center: [APP.mapCentre.lat, APP.mapCentre.lng],
      zoom: APP.mapZoom,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
    });
    this.map.attributionControl.setPrefix(false);
    this.tiles = L.tileLayer(TILES[theme], { attribution: ATTRIBUTION, subdomains: "abcd", maxZoom: 19, detectRetina: true }).addTo(this.map);
    this.zoneLayer.addTo(this.map);
    this.routeLayer.addTo(this.map);
    this.pickupLayer.addTo(this.map);
    this.driverLayer.addTo(this.map);
    this.onDriverClick = onDriverClick;
    this.onPickupClick = onPickupClick;
  }

  private readonly onDriverClick: (id: string) => void;
  private readonly onPickupClick: (jobId: string) => void;

  setTheme(theme: Theme): void {
    this.tiles.remove();
    this.tiles = L.tileLayer(TILES[theme], { attribution: ATTRIBUTION, subdomains: "abcd", maxZoom: 19, detectRetina: true }).addTo(this.map);
    this.tiles.bringToBack();
  }

  syncDrivers(drivers: readonly Driver[], focusedId: string | null): void {
    const seen = new Set<string>();
    for (const d of drivers) {
      seen.add(d.id);
      const tone = DRIVER_STATUS[d.status].tone;
      const key = `${tone}|${d.id === focusedId ? 1 : 0}`;
      const existing = this.markers.get(d.id);
      if (existing) {
        existing.marker.setLatLng([d.lat, d.lng]);
        if (existing.key !== key) {
          existing.marker.setIcon(this.driverIcon(d.callsign, tone, d.id === focusedId));
          existing.key = key;
        }
        existing.marker.setTooltipContent(this.driverTooltip(d));
      } else {
        const marker = L.marker([d.lat, d.lng], {
          icon: this.driverIcon(d.callsign, tone, d.id === focusedId),
          keyboard: false,
          riseOnHover: true,
        })
          .bindTooltip(this.driverTooltip(d), { direction: "top", offset: [0, -12] })
          .on("click", () => this.onDriverClick(d.id))
          .addTo(this.driverLayer);
        this.markers.set(d.id, { marker, key });
      }
      this.markers.get(d.id)?.marker.setZIndexOffset(d.id === focusedId ? 1000 : 0);
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.marker.remove();
        this.markers.delete(id);
      }
    }
  }

  /** Waiting jobs show as pickup pins so the dispatcher sees demand against supply. */
  syncPickups(jobs: readonly Job[], now: number): void {
    const seen = new Set<string>();
    for (const job of jobs) {
      seen.add(job.id);
      const overdue = job.pickupAt < now;
      const tone = JOB_STATUS[job.status].tone;
      const key = `${tone}|${overdue ? 1 : 0}`;
      const existing = this.pickups.get(job.id);
      if (existing && existing.key === key) continue;
      existing?.marker.remove();
      const marker = L.marker([job.pickup.lat, job.pickup.lng], {
        icon: L.divIcon({
          className: "pickup-pin",
          html: `<span class="pin${overdue ? " is-overdue" : ""}" data-tone="${tone}"></span>`,
          iconSize: [0, 0],
        }),
        keyboard: false,
      })
        .bindTooltip(
          `Job ${job.number}, ${escapeHtml(JOB_STATUS[job.status].label.toLowerCase())}<br>${escapeHtml(job.pickup.label)} at ${formatFleetTime(job.pickupAt)}`,
          { direction: "top", offset: [0, -10] },
        )
        .on("click", () => this.onPickupClick(job.id))
        .addTo(this.pickupLayer);
      this.pickups.set(job.id, { marker, key });
    }
    for (const [id, p] of this.pickups) {
      if (!seen.has(id)) {
        p.marker.remove();
        this.pickups.delete(id);
      }
    }
  }

  syncZones(zones: readonly Zone[], visible: boolean): void {
    const key = `${visible}|${zones.map((z) => `${z.id}${z.surge ? "s" : ""}${z.fullyBooked ? "f" : ""}`).join()}`;
    if (key === this.zonesKey) return;
    this.zonesKey = key;
    this.zoneLayer.clearLayers();
    if (!visible) return;
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue("--line-strong").trim();
    const hot = style.getPropertyValue("--tone-bidding").trim();
    for (const z of zones) {
      const flagged = z.surge || z.fullyBooked;
      L.circle([z.lat, z.lng], {
        radius: z.radiusM,
        color: flagged ? hot : line,
        weight: flagged ? 1.5 : 1,
        dashArray: flagged ? undefined : "4 4",
        fillColor: flagged ? hot : line,
        fillOpacity: flagged ? 0.1 : 0.03,
        interactive: false,
      }).addTo(this.zoneLayer);
    }
  }

  /** Draws the selected job: driver to pickup (solid), pickup through vias to drop-off (dashed). */
  showRoute(job: Job | null, driver: Driver | null): void {
    this.routeLayer.clearLayers();
    if (!job) return;
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--meter").trim();
    const blue = style.getPropertyValue("--tone-enroute").trim();
    const points: L.LatLngExpression[] = [job.pickup, ...job.vias, ...(job.dropoff ? [job.dropoff] : [])].map((p) => [p.lat, p.lng]);
    if (points.length > 1) L.polyline(points, { color: accent, weight: 3, dashArray: "6 6", opacity: 0.9 }).addTo(this.routeLayer);
    if (driver) L.polyline([[driver.lat, driver.lng], [job.pickup.lat, job.pickup.lng]], { color: blue, weight: 3, opacity: 0.85 }).addTo(this.routeLayer);
    if (job.dropoff) L.circleMarker([job.dropoff.lat, job.dropoff.lng], { radius: 6, color: accent, weight: 2, fillColor: accent, fillOpacity: 1 }).addTo(this.routeLayer);
    this.map.flyToBounds(L.latLngBounds([...points, ...(driver ? [[driver.lat, driver.lng] as L.LatLngTuple] : [])]), { padding: [40, 40], maxZoom: 14, duration: 0.6 });
  }

  flyTo(point: LatLng, zoom = 14): void {
    this.map.flyTo([point.lat, point.lng], Math.max(zoom, this.map.getZoom()), { duration: 0.6 });
  }

  fitAll(): void {
    const pts = [...this.markers.values()].map((m) => m.marker.getLatLng());
    if (pts.length) this.map.flyToBounds(L.latLngBounds(pts), { padding: [30, 30], duration: 0.6 });
  }

  zoom(delta: 1 | -1): void {
    if (delta > 0) this.map.zoomIn();
    else this.map.zoomOut();
  }

  invalidateSize(): void {
    this.map.invalidateSize();
  }

  destroy(): void {
    this.map.remove();
    this.markers.clear();
    this.pickups.clear();
  }

  private driverIcon(callsign: string, tone: string, focused: boolean): L.DivIcon {
    return L.divIcon({
      className: "driver-marker",
      html: `<span class="chip${focused ? " is-focused" : ""}" data-tone="${tone}">${escapeHtml(callsign)}</span>`,
      iconSize: [0, 0],
    });
  }

  private driverTooltip(d: Driver): string {
    return `<b>${escapeHtml(d.callsign)}</b> ${escapeHtml(d.name)}<br>${escapeHtml(DRIVER_STATUS[d.status].label)}, ${escapeHtml(d.vehicle.toLowerCase())}`;
  }
}
