/**
 * Every shortcut in one table. Handlers and the hints in placeholders both read from here.
 * Keys match the console operators already use, so nobody has to relearn them.
 */
export const KEYMAP = {
  save: { keys: "f1", hint: "F1", label: "Save job" },
  pickup: { keys: "f2", hint: "F2", label: "Pickup address" },
  destination: { keys: "f2", hint: "DOUBLE F2", label: "Destination (press twice)" },
  name: { keys: "f4", hint: "F4", label: "Passenger name" },
  phone: { keys: "f4", hint: "DOUBLE F4", label: "Phone (press twice)" },
  search: { keys: "f6", hint: "F6", label: "Booking search" },
  clear: { keys: "f8", hint: "F8", label: "Clear the form" },
  via: { keys: "f10", hint: "F10", label: "Via stops" },
  lead: { keys: "alt+l", hint: "ALT+L", label: "Lead time" },
  recurring: { keys: "alt+r", hint: "ALT+R", label: "Recurring booking" },
  tariff1: { keys: "alt+d", hint: "ALT+D", label: "Standard fare" },
  tariff2: { keys: "alt+w", hint: "ALT+W", label: "Large car fare" },
  tariff3: { keys: "alt+e", hint: "ALT+E", label: "Executive fare" },
  broadcast: { keys: "alt+4", hint: "ALT+4", label: "Send driver message" },
  close: { keys: "escape", hint: "ESC", label: "Close panel" },
} as const;

/** Two presses of the same key inside this window count as a double press. */
export const DOUBLE_PRESS_MS = 400;
