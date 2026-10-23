"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the playback map loads in the browser only.
export const PlaybackPage = dynamic(() => import("./Playback").then((m) => m.Playback), { ssr: false });
