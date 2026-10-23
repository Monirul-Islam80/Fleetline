import type { Metadata } from "next";
import { PlaybackPage } from "@/components/pages/PlaybackPage";

export const metadata: Metadata = { title: "Driver Playback" };

export default function Page() {
  return <PlaybackPage />;
}
