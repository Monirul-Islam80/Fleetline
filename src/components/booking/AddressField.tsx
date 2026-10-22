"use client";

import { memo, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { registerFocus, type FocusTarget } from "@/lib/focusRegistry";
import { toStop } from "@/lib/stops";
import { PLACES } from "@/mock/geography";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectCallerRecentStops } from "@/store/selectors";
import { fieldChanged, stopSelected, viaAdded } from "@/store/slices/bookingSlice";
import type { Stop } from "@/types/domain";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";
import s from "./booking.module.css";

type AddressKind = "pickup" | "dropoff" | "via";

interface AddressFieldProps {
  kind: AddressKind;
  label: string;
  kbd?: string;
  focus: FocusTarget;
  placeholder?: string;
  adornment?: ReactNode;
  className?: string;
}

interface Option {
  key: string;
  stop: Stop;
  group: "Recent for this caller" | "Places";
}

const MAX_RESULTS = 8;

/**
 * Placeholder for GET /places/search. Every word must match the label, area or postcode;
 * matches in the place name rank above matches that only hit the town.
 */
function searchPlaces(query: string): Stop[] {
  const q = query.toLowerCase().trim();
  const words = q.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { stop: Stop; score: number }[] = [];
  for (const p of PLACES) {
    const label = p.label.toLowerCase();
    const hay = `${label} ${p.area.toLowerCase()} ${p.postcode.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const inLabel = words.filter((w) => label.includes(w)).length;
    const score = (label.startsWith(q) || `${p.area} ${p.label}`.toLowerCase().startsWith(q) ? 100 : 0) + (label.startsWith(words[0] ?? "") ? 10 : 0) + inLabel;
    scored.push({ stop: toStop(p), score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((x) => x.stop);
}

const TEXT_FIELD = { pickup: "pickupText", dropoff: "dropoffText" } as const;

/** Keyboard-first address combobox: type, arrow to choose, Enter to confirm. */
export const AddressField = memo(function AddressField({ kind, label, kbd, focus, placeholder, adornment, className }: AddressFieldProps) {
  const dispatch = useAppDispatch();
  const listId = useId();
  const recent = useAppSelector(selectCallerRecentStops);
  const storeText = useAppSelector((st) => (kind === "via" ? "" : st.booking.form[TEXT_FIELD[kind]]));
  const error = useAppSelector((st) => (kind === "via" ? undefined : st.booking.errors[TEXT_FIELD[kind]]));
  const viaCount = useAppSelector((st) => st.booking.form.vias.length);
  const [viaText, setViaText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useMemo(() => registerFocus(focus), [focus]);

  const text = kind === "via" ? viaText : storeText;

  const options = useMemo<Option[]>(() => {
    const matches = searchPlaces(text);
    if (text.trim()) return matches.map((stop, i) => ({ key: `p${i}`, stop, group: "Places" }));
    return recent.map((stop, i) => ({ key: `r${i}`, stop, group: "Recent for this caller" }));
  }, [text, recent]);

  const setText = (value: string) => {
    if (kind === "via") setViaText(value);
    else dispatch(fieldChanged({ field: TEXT_FIELD[kind], value }));
    setActive(0);
    setOpen(true);
  };

  const choose = (option: Option | undefined) => {
    if (!option) return;
    if (kind === "via") {
      dispatch(viaAdded(option.stop));
      setViaText("");
    } else {
      dispatch(stopSelected({ field: kind, stop: option.stop }));
    }
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Enter":
        if (open && options.length) {
          e.preventDefault();
          choose(options[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.stopPropagation();
          setOpen(false);
        }
        break;
      case "Tab":
        // Tab accepts the highlighted match, like most dispatch tools.
        if (open && text.trim() && options.length) choose(options[active]);
        break;
    }
  };

  const showList = open && (options.length > 0 || text.trim().length > 1);
  const activeId = showList && options[active] ? `${listId}-${active}` : undefined;
  let lastGroup: string | null = null;

  return (
    <div className={`${s.combo} ${className ?? ""}`}>
      <TextField
        ref={ref}
        label={kind === "via" && viaCount ? `${label} (${viaCount} added)` : label}
        kbd={kbd}
        placeholder={placeholder}
        value={text}
        error={error}
        adornment={adornment}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className={s.list} id={listId} role="listbox" aria-label={`${label} suggestions`}>
          {options.length === 0 && <li className={s.noMatch}>No match. Try a street, town or postcode.</li>}
          {options.map((option, i) => {
            const header = option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            return (
              <li key={option.key} role="presentation">
                {header && <div className={s.group}>{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={s.option}
                  // mousedown keeps focus in the input so blur does not close the list first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <Icon name={option.group === "Places" ? "zone" : "clock"} size={14} />
                  <span className={s.optionMain}>{option.stop.label}</span>
                  <span className={s.optionSub}>
                    {option.stop.area} {option.stop.postcode}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
