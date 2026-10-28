"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { connectRealtime } from "@/api/realtime";
import { makeStore } from "@/store";
import { loadSnapshot } from "@/store/thunks/inbox";

/** One store per browser tab: loads the snapshot, then keeps it live through the realtime feed. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void store.dispatch(loadSnapshot()).then(() => {
      if (!cancelled) stop = connectRealtime(store);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
