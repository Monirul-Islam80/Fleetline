import { APP, SIM } from "@/config/app";
import type { AppStore } from "@/store";
import { realtimeReceived, type RealtimeBatch } from "@/store/actions";
import { fieldChanged } from "@/store/slices/bookingSlice";
import { toastShown } from "@/store/slices/uiSlice";
import { lookupCaller } from "@/store/thunks/booking";
import { loadSnapshot } from "@/store/thunks/inbox";
import type { IncomingCall } from "@/types/api";
import { createAppBooking, engineTick } from "./mockEngine";

/**
 * Starts the live feed and returns a stop function.
 * live: a WebSocket that sends RealtimeBatch JSON messages, reconnecting with backoff.
 * mock: the in-browser engine, ticking once a second.
 */
export function connectRealtime(store: AppStore): () => void {
  return APP.apiMode === "live" ? connectSocket(store) : startMockEngine(store);
}

/** Screen pop: an incoming call fills the phone box when the form is free, and caller ID runs. */
function onCall(store: AppStore, call: IncomingCall): void {
  if (call.ended) return;
  const who = call.customer ? `${call.customer.name} (${call.phone})` : call.phone;
  store.dispatch(toastShown({ tone: "info", text: `Incoming call: ${who}` }));
  const form = store.getState().booking.form;
  if (form.phone.trim() || form.name.trim()) return; // operator is mid-booking: don't overwrite
  store.dispatch(fieldChanged({ field: "phone", value: call.phone }));
  void store.dispatch(lookupCaller());
}

function connectSocket(store: AppStore): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: number | undefined;
  let stopped = false;
  let hadConnection = false;

  const open = () => {
    socket = new WebSocket(APP.wsUrl);
    socket.onopen = () => {
      retry = 0;
      // After a drop the store may have missed changes: reload once on reconnect.
      if (hadConnection) void store.dispatch(loadSnapshot());
      hadConnection = true;
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      const batch = JSON.parse(event.data) as RealtimeBatch;
      store.dispatch(realtimeReceived(batch));
      for (const call of batch.calls ?? []) onCall(store, call);
    };
    socket.onclose = () => {
      if (stopped) return;
      const delay = Math.min(15_000, 500 * 2 ** retry);
      retry += 1;
      if (retry === 2) store.dispatch(toastShown({ tone: "warning", text: "Live connection lost, reconnecting" }));
      timer = window.setTimeout(open, delay);
    };
  };
  open();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
  };
}

function startMockEngine(store: AppStore): () => void {
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
