import { memo } from "react";

/** Inline stroke icons on a 24 px grid. One file, no icon library. */
const PATHS = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  book: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Zm0 14a2 2 0 0 1 2-2h11M9 8h5",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  refresh: "M20 11a8 8 0 0 0-14.7-4.3L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.7 4.3L20 16m0 4v-4h-4",
  x: "M6 6l12 12M18 6 6 18",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  grid: "M4 4h4v4H4V4Zm6 0h4v4h-4V4Zm6 0h4v4h-4V4ZM4 10h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM4 16h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4Z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  car: "M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16M5 16v3h3v-3m8 0v3h3v-3M8 13h.01M16 13h.01",
  doc: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 17v-3M13 17v-5M16 17v-2",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  wrench: "M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8a2.8 2.8 0 0 1-4-4l8-8 1.3-1.3a4 4 0 0 1-3.6-1.4ZM14 4l2 2",
  chat: "M8 10h8M8 14h5M21 12a8 8 0 0 1-11.8 7L4 20l1-4.6A8 8 0 1 1 21 12Z",
  close: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6m0-6-6 6",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6",
  expand: "M15 4h5v5M9 20H4v-5M20 4l-7 7M4 20l7-7",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A17 17 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 4.4-1M10 10a3 3 0 0 0 4 4",
  check: "M5 12l5 5L20 7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5",
  area: "M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M9 9h6v6H9V9Z",
  traffic: "M8 3h8v18H8V3Zm4 3h.01M12 12h.01M12 18h.01",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  arrowRight: "M4 12h16m-5-5 5 5-5 5",
  calendar: "M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  pin: "M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M8 5v14M16 5v14",
  code: "M8 8l-4 4 4 4m8-8 4 4-4 4",
  sortUp: "M12 6l5 6H7l5-6Z",
  sortDown: "M12 18l-5-6h10l-5 6Z",
  message: "M4 5h16v11H8l-4 4V5Z",
  dot: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  eraser: "M8 20h12M5 14l8-8 6 6-8 8H9l-4-4Z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-6 1.5 2.6 3-.4.9 2.9 2.7 1.3-1 2.8 1 2.8-2.7 1.3-.9 2.9-3-.4L12 21l-1.5-2.6-3 .4-.9-2.9-2.7-1.3 1-2.8-1-2.8 2.7-1.3.9-2.9 3 .4L12 3Z",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const Icon = memo(function Icon({ name, size = 16, strokeWidth = 1.9, className }: IconProps) {
  const filled = name === "sortUp" || name === "sortDown" || name === "dot";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
});
