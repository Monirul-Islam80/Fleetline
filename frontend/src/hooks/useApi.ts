"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/api/client";
import { useAppDispatch } from "@/store/hooks";
import { withApi } from "@/store/thunks/inbox";

interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an API read and tracks loading and error. `run` is stable; call it from a Search button,
 * or pass `auto` to run whenever `deps` change (debounced by `delayMs`).
 */
export function useApi<T>(call: (api: ApiClient) => Promise<T>, options: { auto?: boolean; delayMs?: number; deps?: unknown[] } = {}) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<ApiState<T>>({ data: undefined, loading: false, error: null });
  const callRef = useRef(call);
  const seq = useRef(0);
  useEffect(() => {
    callRef.current = call;
  });

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dispatch(withApi(callRef.current));
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: (error as Error).message }));
    }
  }, [dispatch]);

  const { auto = false, delayMs = 0, deps = [] } = options;
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => void run(), delayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are supplied by the caller
  }, [auto, delayMs, run, ...deps]);

  return { ...state, run };
}
