"use client";

import { useCallback, useState } from "react";
import { MapController } from "./MapController";

/**
 * Creates the map when its container mounts and destroys it on unmount.
 * Returns a ref callback for the container and the controller (null until mounted).
 */
export function useMap(onDriverClick?: (id: string) => void) {
  const [map, setMap] = useState<MapController | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const controller = new MapController(node, onDriverClick);
      const observer = new ResizeObserver(() => controller.invalidateSize());
      observer.observe(node);
      setMap(controller);
      return () => {
        observer.disconnect();
        controller.destroy();
        setMap(null);
      };
    },
    [onDriverClick],
  );
  return { ref, map };
}
