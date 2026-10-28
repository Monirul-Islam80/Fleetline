"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { Tone } from "@/config/status";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toastDismissed, type ToastTone } from "@/store/slices/uiSlice";
import { Icon } from "./Icon";
import s from "./ui.module.css";

/** Calls `onClose` on Escape or a click outside `ref`. */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
    };
  }, [ref, onClose, enabled]);
}

/** Centred dialog over a dimmed screen. Escape or a click on the backdrop closes it. */
export function Modal({ title, width, onClose, children }: { title?: string; width: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div className={s.backdrop}>
      <div ref={ref} className={s.modal} style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        {title && <div className={s.modalHead}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

/**
 * Panel that drops over the right side of the work area, the way the counter tabs open.
 * Closing is handled by the opener (tab click or Escape through the store).
 */
export function FloatPanel({ width, style, children }: { width: number | string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={s.float} style={{ width, ...style }} role="dialog">
      <div className={s.floatBody}>{children}</div>
    </div>
  );
}

const TONE: Record<ToastTone, Tone> = { info: "enroute", success: "free", warning: "offer", danger: "problem" };

function ToastItem({ id, tone, text }: { id: number; tone: ToastTone; text: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const timer = window.setTimeout(() => dispatch(toastDismissed(id)), 4000);
    return () => window.clearTimeout(timer);
  }, [dispatch, id]);
  return (
    <div className={s.toast} data-tone={TONE[tone]} role="status">
      <span style={{ flex: 1 }}>{text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => dispatch(toastDismissed(id))}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppSelector((st) => st.ui.toasts);
  return (
    <div className={s.toasts} aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
