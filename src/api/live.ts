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
      throw new Error(text || `${method} ${path} failed with ${res.status}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
}

/** The REST contract. Each line is one endpoint the backend must provide. */
export function createLiveApi(baseUrl: string): ApiClient {
  const http = createHttp(baseUrl);
  return {
    bootstrap: () => http("GET", "/snapshot"),
    createJob: (input) => http("POST", "/jobs", input),
    jobAction: (jobId, action, callsign) => http("POST", `/jobs/${jobId}/${action}`, { callsign }),
    lookupCustomer: (phone) => http("GET", "/customers/lookup", undefined, { phone }),
    searchPlaces: (q) => http("GET", "/places", undefined, { q }),
    searchBookings: (query) => http("GET", "/bookings", undefined, { ...query }),
    searchDrivers: (query) => http("GET", "/drivers", undefined, { ...query }),
    searchLogs: (query) => http("GET", "/logs", undefined, { ...query }),
    sendStaffMessage: (to, body) => http("POST", "/staff-messages", { to, body }),
    sendBroadcast: (input) => http("POST", "/driver-messages", input),
    takeChat: (id) => http("POST", `/driver-chats/${id}/take`),
    closeChat: (id) => http("POST", `/driver-chats/${id}/done`),
    takeCall: (id) => http("POST", `/call-queue/${id}/take`),
    deleteAlert: (id) => http("DELETE", `/alerts/${id}`),
    deleteFlight: (id) => http("DELETE", `/flights/${id}`),
    clearZoneFlags: () => http("POST", "/zones/clear-flags"),
    driverTracks: ({ from, to, centre, radiusM }) => http("GET", "/playback", undefined, { from, to, lat: centre.lat, lng: centre.lng, radiusM }),
  };
}
