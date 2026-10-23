"use client";

import { useAppSelector } from "@/store/hooks";
import { selectNowMinute, selectZoneQueues } from "@/store/selectors";
import { Badge, Button } from "../ui/controls";
import s from "./pages.module.css";

const ROWS = 5;

/** Rank queues per zone. Green = parked, with minutes waited; grey = free in the zone, not parked. */
export function Parking() {
  const queues = useAppSelector(selectZoneQueues);
  const now = useAppSelector(selectNowMinute);
  return (
    <div className={s.parking}>
      <div className={s.parkingBoard}>
        <div className={s.zones}>
          {queues.map(({ zone, drivers }) => (
            <div key={zone.id} className={s.zoneCol}>
              <div className={s.zoneHead}>
                {zone.name.toUpperCase().slice(0, 12)}
                <Badge value={drivers.length} tone={drivers.length ? "offer" : "off"} />
              </div>
              {Array.from({ length: Math.max(ROWS, drivers.length) }, (_, i) => {
                const d = drivers[i];
                if (!d) return <div key={i} className={s.cell} />;
                const parked = d.status === "PARKED";
                return (
                  <div key={d.id} className={`${s.cell} ${parked ? s.parked : s.free}`} title={d.name}>
                    {d.callsign}
                    {parked && ` [${Math.max(0, Math.round((now - d.statusSince) / 60_000))}m]`}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className={s.parkingFoot}>
          <span>Green: parked on a rank, minutes waited. Grey: free in the zone.</span>
          <Button>Options</Button>
        </div>
      </div>
    </div>
  );
}
