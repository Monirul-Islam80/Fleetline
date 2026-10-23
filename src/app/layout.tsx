import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP } from "@/config/app";
import { StoreProvider } from "@/components/app/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP.fleetName} - ${APP.product}`,
  description: "Dispatch console",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- the root layout covers every page */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap" />
      </head>
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
