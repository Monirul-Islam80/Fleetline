"use client";

import dynamic from "next/dynamic";

// The saved tile layout lives in browser storage, so the board renders in the browser only.
export const WallboardPage = dynamic(() => import("./Wallboard").then((m) => m.Wallboard), { ssr: false });
