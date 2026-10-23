"use client";

import dynamic from "next/dynamic";
import { useAppSelector } from "@/store/hooks";
import { BookingForm } from "./BookingForm";
import { ExtraFields } from "./ExtraFields";
import { HelperColumn } from "./HelperColumn";
import { JobsArea } from "./JobsArea";
import { Modals } from "./Modals";
import { WaitingTimes } from "./WaitingTimes";
import s from "./dispatch.module.css";

// Leaflet needs `window`, so the map loads in the browser only.
const DispatchMap = dynamic(() => import("./DispatchMap").then((m) => m.DispatchMap), {
  ssr: false,
  loading: () => <section className={s.card} />,
});

/** Booking form, driver lists and fare, map (or extra fields), waiting times; job lists below. */
export function DispatchView() {
  const showExtras = useAppSelector((st) => st.ui.showExtras);
  return (
    <div className={s.view}>
      <div className={s.top}>
        <BookingForm />
        <HelperColumn />
        {showExtras ? <ExtraFields /> : <DispatchMap />}
        <WaitingTimes />
      </div>
      <JobsArea />
      <Modals />
    </div>
  );
}
