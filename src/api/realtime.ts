import { APP, SIM } from "@/config/app";
import type { AppStore } from "@/store";
import { realtimeReceived, type RealtimeBatch } from "@/store/actions";
import { createAppBooking, engineTick } from "./mockEngine";

/**
 * Starts the live feed and returns a stop function.
 * live: a WebSocket that sends RealtimeBatch JSON messages.
 * mock: the in-browser engine, ticking once a second.
 */
export function connectRealtime(store: AppStore): () => void {
  if (APP.apiMode === "live") {
    const socket = new WebSocket(APP.wsUrl);
    socket.onmessage = (event: MessageEvent<string>) => store.dispatch(realtimeReceived(JSON.parse(event.data) as RealtimeBatch));
    return () => socket.close();
  }

  const running = () => !store.getState().ui.paused && document.visibilityState === "visible";
  const tick = window.setInterval(() => {
    if (running()) store.dispatch(engineTick());
  }, SIM.tickMs);
  const feed = window.setInterval(() => {
    if (running() && store.getState().ui.demoFeed) store.dispatch(createAppBooking());
  }, SIM.appBookingEveryMs);
  return () => {
    window.clearInterval(tick);
    window.clearInterval(feed);
  };
}
