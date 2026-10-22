/**
 * Every keyboard shortcut in one table. Components read hints from here, so changing a key
 * changes the handler, the placeholder hint and the shortcut sheet together.
 * Function keys match what operators already use today to keep retraining low.
 */
export const KEYMAP = {
  save: { keys: "f1", hint: "F1", label: "Save job" },
  pickup: { keys: "f2", hint: "F2", label: "Pickup address" },
  destination: { keys: "f2", hint: "F2 F2", label: "Destination (press twice)" },
  name: { keys: "f4", hint: "F4", label: "Passenger name" },
  phone: { keys: "f4", hint: "F4 F4", label: "Phone and caller history (press twice)" },
  search: { keys: "f6", hint: "F6", label: "Search jobs and drivers" },
  clear: { keys: "f8", hint: "F8", label: "Clear the form" },
  via: { keys: "f10", hint: "F10", label: "Add a via stop" },
  lead: { keys: "alt+l", hint: "Alt L", label: "Lead time" },
  recurring: { keys: "alt+r", hint: "Alt R", label: "Recurring booking" },
  tariff1: { keys: "alt+1", hint: "Alt 1", label: "Use standard fare" },
  tariff2: { keys: "alt+2", hint: "Alt 2", label: "Use large car fare" },
  tariff3: { keys: "alt+3", hint: "Alt 3", label: "Use executive fare" },
  close: { keys: "escape", hint: "Esc", label: "Close panel" },
  help: { keys: "shift+slash", hint: "?", label: "Show shortcuts" },
} as const;

export type ShortcutId = keyof typeof KEYMAP;

/** Two presses of the same key inside this window count as a double press. */
export const DOUBLE_PRESS_MS = 400;
