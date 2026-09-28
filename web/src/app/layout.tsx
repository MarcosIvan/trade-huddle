import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { BASE_PATH } from "@/lib/stats";
import "@/styles/globals.css";

// Barlow and Barlow Condensed (SIL Open Font License), served from this site:
// no requests to third-party font services.
const body = localFont({
  src: [
    { path: "../fonts/Barlow-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Barlow-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Barlow-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

const display = localFont({
  src: [
    { path: "../fonts/BarlowCondensed-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/BarlowCondensed-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/BarlowCondensed-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trade Huddle",
  description:
    "Fair trade suggestions and a trade analyzer for Sleeper redraft leagues, valuing players by what they have produced and how they are playing right now.",
  referrer: "no-referrer",
  icons: { icon: "icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1f3f" },
    { media: "(prefers-color-scheme: dark)", color: "#07142a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable}`}
      // theme-init.js may set data-theme before React loads.
      suppressHydrationWarning
    >
      <head>
        {/* Blocking on purpose: applies the saved theme before the first paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src={`${BASE_PATH}/theme-init.js`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
