"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

/* ---------- Button ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "dark" | "primary" | "danger" | "light";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  /** Icon-only button; `label` becomes the accessible name and tooltip. */
  label?: string;
}

export function Button({ variant = "dark", size = "md", icon, label, className, children, type = "button", ...rest }: ButtonProps) {
  const iconOnly = !children;
  return (
    <button
      type={type}
      className={cx(s.btn, variant !== "dark" && s[variant], size !== "md" && s[size], iconOnly && s.square, className)}
      aria-label={iconOnly ? label : undefined}
      title={label}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 17} />}
      {children}
    </button>
  );
}

/** On/off chip: blue with a tick when on, white with a red cross when off (REC JOBS, SYSTEM LOGS...). */
export function Toggle({ on, onChange, children, className }: { on: boolean; onChange: (next: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={cx(s.toggle, className)} aria-pressed={on} onClick={() => onChange(!on)}>
      <span className={s.toggleMark}>
        <Icon name={on ? "check" : "x"} size={11} strokeWidth={3} />
      </span>
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Yellow, read-only value worked out by the system. */
  computed?: boolean;
  /** Yellow but editable, e.g. the fare an operator may override. */
  highlight?: boolean;
  error?: string;
  /** Small button inside the right edge, e.g. the swap arrows. */
  adornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ computed, highlight, error, adornment, className, ...rest }, ref) {
  const input = (
    <input
      ref={ref}
      autoComplete="off"
      spellCheck={false}
      {...rest}
      className={cx(s.input, (computed || highlight) && s.computed, !adornment && className)}
      aria-invalid={error ? true : undefined}
      title={error ?? rest.title}
      readOnly={computed || rest.readOnly}
      tabIndex={computed ? -1 : rest.tabIndex}
    />
  );
  if (!adornment) return input;
  return (
    <span className={cx(s.adorned, className)}>
      {input}
      {adornment}
    </span>
  );
});

export function Adornment({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className={s.adornment} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, className, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(s.input, className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(s.input, className)} {...rest} />;
});

/* ---------- Layout helpers ---------- */

/** Two-column label grid: "DATE:" on the left, controls on the right. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.formGrid, className)}>{children}</div>;
}

export function FormRow({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      <div className={s.formRow}>{children}</div>
    </>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label className={s.label} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(s.card, className)}>
      {title && (
        <div className={s.cardHead}>
          <span className={s.cardTitle}>{title}</span>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Small display pieces ---------- */

export function Chip({ children, tone, title }: { children: ReactNode; tone?: "yellow" | "cyan" | "blue"; title?: string }) {
  return (
    <span className={cx(s.chip, tone === "yellow" && s.chipYellow, tone === "cyan" && s.chipCyan, tone === "blue" && s.chipBlue)} title={title}>
      {children}
    </span>
  );
}

export function Callsign({ value }: { value: string }) {
  return <span className={s.callsign}>{value}</span>;
}

export function Dot({ title }: { title?: string }) {
  return <span className={s.dot} title={title} />;
}

export function Badge({ value, tone }: { value: number; tone?: string }) {
  return (
    <span className={s.badge} data-tone={tone}>
      {value}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}
