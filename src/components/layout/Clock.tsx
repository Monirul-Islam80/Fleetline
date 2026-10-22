"use client";

import { memo, useEffect, useState } from "react";
import { formatFleetClock, formatFleetDay, formatLocalTime } from "@/lib/format";
import s from "./topbar.module.css";

/** Ticks on its own so the rest of the header never re-renders for the clock. */
export const Clock = memo(function Clock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={s.clock} title={`Fleet time (UK). Your local time is ${formatLocalTime(now)}.`}>
      <span className={s.clockMain}>{formatFleetClock(now)}</span>
      <span className={s.clockSub}>{formatFleetDay(now)}</span>
    </div>
  );
});
