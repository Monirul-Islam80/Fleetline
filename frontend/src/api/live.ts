import type { JobAction } from "@/types/api";
import type { ApiClient } from "./client";

type Query = Record<string, string | number | boolean | string[] | undefined>;

/** Tiny fetch wrapper: JSON in, JSON out, cookies for the session, readable errors. */
function createHttp(baseUrl: string) {
  return async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query?: Query): Promise<T> {
    const url = new URL(`${baseUrl}${path}`, window.location.origin);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        // not JSON: keep the text
      }
      throw new Error(message || `${method} ${path} failed with ${res.status}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
}

/** Each console action, mapped to the endpoint-list route that performs it. */
const ACTION_ROUTE: Record<JobAction, { path: string; body?: (callsign?: string) => unknown }> = {
  pause: { path: "pause" },
  resume: { path: "unpause" },
  cancel: { path: "cancel" },
  redispatch: { path: "status", body: () => ({ status: "NEW" }) },
  noshow: { path: "status", body: () => ({ status: "NOSHOW" }) },
  assign: { path: "dispatch", body: (callsign) => ({ callsign }) },
};

/** The REST contract, served by the Go backend under /api/v1 (see fleetline-api/README.md). */
export function createLiveApi(baseUrl: string): ApiClient {
  const http = createHttp(baseUrl);
  return {
    bootstrap: () => http("GET", "/snapshot"),
    createJob: (input) => http("POST", "/bookings/add", input),
    jobAction: async (jobId, action, callsign) => {
      const route = ACTION_ROUTE[action];
      await http("POST", `/bookings/${jobId}/${route.path}`, route.body?.(callsign));
    },
    lookupCustomer: (phone) => http("GET", "/users/lookup", undefined, { phone }),
    searchPlaces: (q) => http("GET", "/addresses", undefined, { q }),
    searchBookings: (query) => http("GET", "/bookings/history", undefined, { ...query }),
    searchDrivers: (query) => http("GET", "/drivers", undefined, { ...query }),
    searchLogs: (query) => http("GET", "/logs", undefined, { ...query }),
    sendStaffMessage: (to, body) => http("POST", "/staff/messages", { to, body }),
    sendBroadcast: (input) => http("POST", "/messages", input),
    takeChat: (id) => http("POST", `/driverchats/${id}/take`),
    closeChat: (id) => http("POST", `/driverchats/${id}/done`),
    takeCall: (id) => http("POST", `/callqueue/${id}/take`),
    deleteAlert: (id) => http("DELETE", `/alerts/${id}`),
    deleteFlight: (id) => http("DELETE", `/flights/${id}`),
    clearZoneFlags: () => http("POST", "/zones/clearflags"),
    driverTracks: ({ from, to, centre, radiusM }) => http("GET", "/drivers/tracks", undefined, { from, to, lat: centre.lat, lng: centre.lng, radiusM }),
  };
}
