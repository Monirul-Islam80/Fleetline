"use client";

import { KEYMAP } from "@/config/keymap";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { shortcutsToggled } from "@/store/slices/uiSlice";
import { Button, Kbd } from "../ui/primitives";
import s from "./overlays.module.css";

/** Generated from the keymap, so it can never drift from the real handlers. */
export function ShortcutSheet() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((st) => st.ui.shortcutsOpen);
  if (!open) return null;
  const close = () => dispatch(shortcutsToggled(false));
  return (
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className={s.sheetHead}>
          <h2>Keyboard shortcuts</h2>
          <Button variant="ghost" iconOnly icon="x" label="Close (Esc)" onClick={close} autoFocus />
        </div>
        <p className={s.note}>Shortcuts work while you type in any field, so a booking never needs the mouse.</p>
        <dl className={s.keys}>
          {Object.entries(KEYMAP).map(([id, k]) => (
            <div key={id} style={{ display: "contents" }}>
              <dt>{k.label}</dt>
              <dd>
                <Kbd>{k.hint}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
