"use client";

import type { ReactNode } from "react";
import { Input, Label, Select } from "../ui/controls";
import s from "./views.module.css";

export type Setter<Q> = <K extends keyof Q>(key: K, value: Q[K]) => void;

export interface FieldDef<Q> {
  label: string;
  /** Plain text or select bound to one query key... */
  key?: keyof Q & string;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  /** ...or a custom control, e.g. date + day + time. */
  render?: (query: Q, set: Setter<Q>) => ReactNode;
}

/**
 * Search forms (Bookings, Drivers) are config: columns of label/control pairs.
 * Adding a filter is one line in the view, plus the matching field on the query type.
 */
export function QueryForm<Q>({ columns, query, set, onSubmit }: { columns: FieldDef<Q>[][]; query: Q; set: Setter<Q>; onSubmit: () => void }) {
  const control = (f: FieldDef<Q>): ReactNode => {
    if (f.render) return f.render(query, set);
    if (!f.key) return null;
    const key = f.key;
    const value = String(query[key] ?? "");
    const onChange = (v: string) => set(key, v as Q[typeof key]);
    return f.options ? (
      <Select value={value} options={f.options} onChange={(e) => onChange(e.target.value)} aria-label={f.label} />
    ) : (
      <Input value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} aria-label={f.label} />
    );
  };
  return (
    <form
      className={s.queryForm}
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {columns.map((col, i) => (
        <div key={i} className={s.queryCol}>
          {col.map((f) => (
            <div key={f.label} style={{ display: "contents" }}>
              <Label>{f.label}</Label>
              <div className={s.queryControl}>{control(f)}</div>
            </div>
          ))}
        </div>
      ))}
      <button type="submit" hidden />
    </form>
  );
}
