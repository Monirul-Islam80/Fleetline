"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

interface Layout {
  order: string[];
  hidden: string[];
}

/** Stored order wins, tiles added in a later release are appended, removed ones are dropped. */
function merge(defaults: readonly string[], stored: Layout | null): Layout {
  if (!stored) return { order: [...defaults], hidden: [] };
  const known = new Set(defaults);
  const order = stored.order.filter((id) => known.has(id));
  return { order: [...order, ...defaults.filter((id) => !order.includes(id))], hidden: stored.hidden.filter((id) => known.has(id)) };
}

function read(key: string): Layout | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layout) : null;
  } catch {
    return null;
  }
}

/**
 * Drag-to-rearrange for a grid of tiles, with hide and reset. The layout is a per-screen
 * preference, so it lives in this browser's storage; move it to a user-settings API later if
 * operators need it to follow them between machines.
 */
export function useTileLayout(defaults: readonly string[], storageKey: string) {
  const [layout, setLayout] = useState<Layout>(() => merge(defaults, read(storageKey)));
  const [dragging, setDragging] = useState<string | null>(null);
  const changed = useRef(false);

  useEffect(() => {
    if (!changed.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // Storage blocked (private window): the layout still works for this visit.
    }
  }, [layout, storageKey]);

  const update = (next: (l: Layout) => Layout) => {
    changed.current = true;
    setLayout(next);
  };

  /** Moves `id` to where `target` sits now. */
  const move = (id: string, target: string) =>
    update((l) => {
      if (id === target) return l;
      const order = l.order.filter((x) => x !== id);
      order.splice(l.order.indexOf(target), 0, id);
      return { ...l, order };
    });

  const step = (id: string, delta: -1 | 1) =>
    update((l) => {
      const visible = l.order.filter((x) => !l.hidden.includes(x));
      const target = visible[visible.indexOf(id) + delta];
      if (!target) return l;
      const order = l.order.filter((x) => x !== id);
      order.splice(l.order.indexOf(target), 0, id);
      return { ...l, order };
    });

  /** Props to spread on a tile. */
  const tileProps = (id: string) => ({
    draggable: true,
    "data-dragging": dragging === id || undefined,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setDragging(id);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      if (dragging !== id) move(dragging, id);
    },
    onDrop: (e: DragEvent) => e.preventDefault(),
    onDragEnd: () => setDragging(null),
  });

  /** Props for the grip button: arrow keys move the tile for keyboard users. */
  const handleProps = (id: string) => ({
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(id, -1);
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") step(id, 1);
      else return;
      e.preventDefault();
    },
  });

  return {
    visible: layout.order.filter((id) => !layout.hidden.includes(id)),
    hidden: layout.hidden,
    tileProps,
    handleProps,
    hide: (id: string) => update((l) => ({ ...l, hidden: [...l.hidden, id] })),
    reset: () => update(() => merge(defaults, null)),
  };
}
