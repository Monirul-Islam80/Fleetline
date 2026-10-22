import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { Kbd } from "./primitives";
import s from "./ui.module.css";

interface FrameProps {
  label: string;
  kbd?: string;
  error?: string;
  computed?: boolean;
  adornment?: ReactNode;
  className?: string;
  htmlFor: string;
  children: ReactNode;
}

/** Shared chrome for every input: small label on top, value below, shortcut hint on the right. */
function FieldFrame({ label, kbd, error, computed, adornment, className, htmlFor, children }: FrameProps) {
  return (
    <div className={cx(s.field, error && s.invalid, computed && s.computed, className)}>
      <div className={s.control}>
        <label className={s.stack} htmlFor={htmlFor}>
          <span className={s.label}>{label}</span>
          {children}
        </label>
        {adornment && <span className={s.adornment}>{adornment}</span>}
        {kbd && <Kbd>{kbd}</Kbd>}
      </div>
      {error && (
        <span className={s.error} id={`${htmlFor}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  kbd?: string;
  error?: string;
  computed?: boolean;
  adornment?: ReactNode;
  className?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, kbd, error, computed, adornment, className, id, ...input },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldFrame label={label} kbd={kbd} error={error} computed={computed} adornment={adornment} className={className} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        className={s.input}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...input}
      />
    </FieldFrame>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label: string;
  options: readonly { value: string; label: string }[];
  error?: string;
  className?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, options, error, className, id, ...select },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldFrame label={label} error={error} className={className} htmlFor={selectId}>
      <select ref={ref} id={selectId} className={s.input} {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
});
