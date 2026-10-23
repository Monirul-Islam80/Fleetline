"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useApi } from "@/hooks/useApi";
import { registerFocus, type FocusTarget } from "@/lib/focusRegistry";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectCallerRecentStops } from "@/store/selectors";
import { fieldChanged, stopSelected, viaChanged, type StopTarget } from "@/store/slices/bookingSlice";
import type { Stop } from "@/types/domain";
import { Input } from "../ui/controls";
import s from "./dispatch.module.css";

interface Option {
  stop: Stop;
  recent: boolean;
}

interface AddressInputProps {
  target: StopTarget;
  placeholder: string;
  focus?: FocusTarget;
  adornment?: ReactNode;
  className?: string;
}

/** Reads and writes the text of pickup, destination or via N in the booking form. */
function useAddressText(target: StopTarget) {
  const dispatch = useAppDispatch();
  const text = useAppSelector((st) =>
    target === "pickup" ? st.booking.form.pickupText : target === "dropoff" ? st.booking.form.dropoffText : (st.booking.form.vias[target]?.text ?? ""),
  );
  const error = useAppSelector((st) => (target === "pickup" ? st.booking.errors.pickupText : target === "dropoff" ? st.booking.errors.dropoffText : undefined));
  const setText = (value: string) =>
    dispatch(typeof target === "number" ? viaChanged({ index: target, patch: { text: value } }) : fieldChanged({ field: target === "pickup" ? "pickupText" : "dropoffText", value }));
  return { text, error, setText };
}

/** Address box with keyboard suggestions: type, arrow down, Enter or Tab to accept. Results come from the API. */
export function AddressInput({ target, placeholder, focus, adornment, className }: AddressInputProps) {
  const dispatch = useAppDispatch();
  const listId = useId();
  const { text, error, setText } = useAddressText(target);
  const recent = useAppSelector(selectCallerRecentStops);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = text.trim();
  const search = useApi((api) => api.searchPlaces(query), { auto: open && query.length > 1, delayMs: 180, deps: [query] });

  const options: Option[] = query ? (search.data ?? []).map((stop) => ({ stop, recent: false })) : recent.map((stop) => ({ stop, recent: true }));
  const show = open && (options.length > 0 || (query.length > 1 && !search.loading));

  const choose = (option: Option | undefined) => {
    if (!option) return;
    dispatch(stopSelected({ target, stop: option.stop }));
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.max(0, Math.min(options.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && show && options.length) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Tab" && show && query && options.length) {
      choose(options[active]);
    } else if (e.key === "Escape" && show) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={`${s.combo} ${className ?? ""}`}>
      <Input
        ref={focus ? registerFocus(focus) : undefined}
        placeholder={placeholder}
        value={text}
        error={error}
        adornment={adornment}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul className={s.list} id={listId} role="listbox">
          {options.length === 0 && <li className={s.noMatch}>No match. Try a street, place or postcode.</li>}
          {options[0]?.recent && <li className={s.group}>Recent for this caller</li>}
          {options.map((o, i) => (
            <li
              key={`${o.stop.label}-${i}`}
              role="option"
              aria-selected={i === active}
              className={s.option}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{o.stop.label.toUpperCase()}</span>
              <small>
                {o.stop.area.toUpperCase()}, {o.stop.postcode}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
