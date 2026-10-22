import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP.product} dispatch console`,
  description: "Keyboard-first dispatch console for private hire fleets",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1424",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout applies to every page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap"
        />
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
