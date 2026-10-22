/**
 * Shortcut keys need to focus inputs that live in different components. Inputs register
 * themselves here by name; the hotkey layer focuses them by name. No prop drilling, no
 * global refs in Redux (DOM nodes are not state).
 */
export type FocusTarget = "phone" | "name" | "pickup" | "dropoff" | "via" | "lead" | "fare" | "search" | "gridSearch";

const nodes = new Map<FocusTarget, HTMLElement>();

export function registerFocus(target: FocusTarget) {
  return (node: HTMLElement | null): void => {
    if (node) nodes.set(target, node);
    else nodes.delete(target);
  };
}

export function focusTarget(target: FocusTarget): void {
  const node = nodes.get(target);
  if (!node) return;
  node.focus();
  if (node instanceof HTMLInputElement) node.select();
}
