"use client";

import { useCallback, useState, type UIEvent } from "react";

interface VirtualRows {
  viewportRef: (node: HTMLDivElement | null) => (() => void) | undefined;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  start: number;
  end: number;
  totalHeight: number;
}

/**
 * Renders only the rows in view plus a small buffer. Enough for thousands of jobs without a
 * table library; row height is fixed, which a dispatch grid wants anyway.
 */
export function useVirtualRows(count: number, rowHeight: number, overscan = 8): VirtualRows {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined;
    setHeight(node.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { viewportRef, onScroll, start, end, totalHeight: count * rowHeight };
}
