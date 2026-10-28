import type { Metadata } from "next";
import { WallboardPage } from "@/components/pages/WallboardPage";

export const metadata: Metadata = { title: "Wallboard" };

export default function Page() {
  return <WallboardPage />;
}
