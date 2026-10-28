/**
 * Shortcut keys need to focus inputs that live in different components. Inputs register
 * themselves here by name; the hotkey layer focuses them by name. No prop drilling, no
 * global refs in Redux (DOM nodes are not state).
 */
export type FocusTarget = "date" | "phone" | "name" | "pickup" | "dropoff" | "lead" | "search";

const nodes = new Map<FocusTarget, HTMLElement>();

const callbacks = new Map<FocusTarget, (node: HTMLElement | null) => void>();

/** Ref callback for an input. Stable per target, so React does not re-attach it each render. */
export function registerFocus(target: FocusTarget): (node: HTMLElement | null) => void {
  let callback = callbacks.get(target);
  if (!callback) {
    callback = (node) => {
      if (node) nodes.set(target, node);
      else nodes.delete(target);
    };
    callbacks.set(target, callback);
  }
  return callback;
}

export function focusTarget(target: FocusTarget): void {
  const node = nodes.get(target);
  if (!node) return;
  node.focus();
  if (node instanceof HTMLInputElement) node.select();
}
