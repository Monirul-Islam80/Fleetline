import { memo } from "react";

/** Inline stroke icons, 24 px grid. Kept in one file so there is no icon-font or library cost. */
const PATHS = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  swap: "M7 4v16M7 4 3 8M7 4l4 4M17 20V4m0 16-4-4m4 4 4-4",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  car: "M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16M5 16v3h3v-3m8 0v3h3v-3M8 13h.01M16 13h.01",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3Z",
  refresh: "M20 11a8 8 0 0 0-14.7-4.3L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.7 4.3L20 16m0 4v-4h-4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  bell: "M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7m4 11a2 2 0 0 0 4 0",
  message: "M4 5h16v11H8l-4 4V5Z",
  chat: "M7 9h10M7 13h6M21 12a8 8 0 0 1-11.8 7L4 20l1-4.6A8 8 0 1 1 21 12Z",
  plane: "M2 16l20-6-4-2-6 2-5-6H5l3 7-4 1-2-2v6l2-1 4 1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0m1-10a3 3 0 1 0-1.5-5.6M22 21a6 6 0 0 0-4-5.7",
  zone: "M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  layers: "M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  maximize: "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5",
  minus: "M5 12h14",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M8 5v14M16 5v14",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  keyboard: "M3 6h18v12H3V6Zm4 4h.01M11 10h.01M15 10h.01M7 14h10",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3",
  list: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  copy: "M9 9h11v11H9V9Zm-4 6H4V4h11v1",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  check: "M5 12l5 5L20 7",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  signal: "M4 20v-3m5 3v-7m5 7V9m5 11V4",
  chevronDown: "M6 9l6 6 6-6",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowDown: "M12 5v14m-6-6 6 6 6-6",
  pound: "M17 19H7c1.5-1 2-3 2-5V9a4 4 0 0 1 7.5-2M6 13h8",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const Icon = memo(function Icon({ name, size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
