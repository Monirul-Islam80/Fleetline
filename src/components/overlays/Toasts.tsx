"use client";

import { memo, useEffect } from "react";
import type { Tone } from "@/config/status";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toastDismissed, type Toast, type ToastTone } from "@/store/slices/uiSlice";
import { Icon } from "../ui/Icon";
import s from "./overlays.module.css";

const TONE: Record<ToastTone, Tone> = { info: "enroute", success: "free", warning: "waiting", danger: "problem" };
const LIFETIME_MS = 4200;

const ToastItem = memo(function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const id = window.setTimeout(() => dispatch(toastDismissed(toast.id)), LIFETIME_MS);
    return () => window.clearTimeout(id);
  }, [dispatch, toast.id]);
  return (
    <div className={s.toast} data-tone={TONE[toast.tone]} role="status">
      {toast.text}
      <button type="button" className={s.toastClose} aria-label="Dismiss" onClick={() => dispatch(toastDismissed(toast.id))}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
});

export function Toasts() {
  const toasts = useAppSelector((st) => st.ui.toasts);
  return (
    <div className={s.toasts} aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
