import type { Metadata } from "next";
import { Parking } from "@/components/pages/Parking";

export const metadata: Metadata = { title: "Parking" };

export default function Page() {
  return <Parking />;
}
