import { memo, type ButtonHTMLAttributes, type ReactNode } from "react";
import { DRIVER_STATUS, JOB_STATUS, type Tone } from "@/config/status";
import { cx } from "@/lib/cx";
import type { DriverStatus, JobStatus } from "@/types/domain";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

/* ---------- Kbd ---------- */

export const Kbd = memo(function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
});

/* ---------- Button ---------- */

type ButtonVariant = "default" | "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  /** Visible label is hidden; `label` is used for aria-label and tooltip. */
  iconOnly?: boolean;
  label?: string;
  active?: boolean;
  kbd?: string;
}

const VARIANT: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: s.primary,
  ghost: s.ghost,
  danger: s.danger,
};

export function Button({
  variant = "default",
  size = "md",
  icon,
  iconOnly,
  label,
  active,
  kbd,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(s.btn, VARIANT[variant], size !== "md" && s[size], iconOnly && s.iconOnly, active && s.active, className)}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={active}
      title={label}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {!iconOnly && children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

/* ---------- Status ---------- */

export const StatusDot = memo(function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return <span className={cx(s.dot, pulse && s.pulse)} data-tone={tone} aria-hidden="true" />;
});

export const JobStatusPill = memo(function JobStatusPill({ status, label }: { status: JobStatus; label?: string }) {
  const meta = JOB_STATUS[status];
  return (
    <span className={s.pill} data-tone={meta.tone}>
      <span className={cx(s.dot, status === "NEW" && s.pulse)} />
      {label ?? meta.label}
    </span>
  );
});

export const DriverStatusPill = memo(function DriverStatusPill({ status }: { status: DriverStatus }) {
  const meta = DRIVER_STATUS[status];
  return (
    <span className={s.pill} data-tone={meta.tone}>
      <span className={s.dot} />
      {meta.label}
    </span>
  );
});

export const CallsignChip = memo(function CallsignChip({ callsign, status }: { callsign: string; status: DriverStatus }) {
  return (
    <span className={s.callsign} data-tone={DRIVER_STATUS[status].tone} title={`${callsign}, ${DRIVER_STATUS[status].label}`}>
      {callsign}
    </span>
  );
});

/* ---------- Tag and count ---------- */

export function Tag({ children, icon, title }: { children: ReactNode; icon?: IconName; title?: string }) {
  return (
    <span className={s.tag} title={title}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Count({ value, tone }: { value: number; tone?: "hot" | "alert" }) {
  return (
    <span className={cx(s.count, value > 0 && tone === "hot" && s.countHot, value > 0 && tone === "alert" && s.countAlert)}>
      {value}
    </span>
  );
}

/* ---------- Segmented tabs ---------- */

interface SegmentedProps<T extends string> {
  items: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ items, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={s.segmented} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={s.segment}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <Count value={item.count} />}
        </button>
      ))}
    </div>
  );
}

/* ---------- Section heading and empty state ---------- */

export function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.sectionHead}>
      <h2 className={s.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={s.empty}>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}
