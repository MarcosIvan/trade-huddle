import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import {
  HOME_URL,
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  STRUCTURED_DATA,
} from "@/lib/site";
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

/** Google Search Console ownership token, set by the deploy workflow when there is one. */
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;

export const metadata: Metadata = {
  metadataBase: new URL(HOME_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // ?demo and ?league=<id> show the same page: search engines index the home address.
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: "website",
    url: HOME_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: { index: true, follow: true },
  verification: googleVerification ? { google: googleVerification } : undefined,
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
      <body>
        <script
          type="application/ld+json"
          // Our own constant, never data from Sleeper; "<" is escaped so it cannot close the tag.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
