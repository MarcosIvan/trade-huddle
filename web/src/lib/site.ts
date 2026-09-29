/**
 * What search engines and link previews read about the site. The deploy
 * workflow sets NEXT_PUBLIC_SITE_URL to the Pages address (for example
 * https://<owner>.github.io/<repository>); locally it falls back to the dev server.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

/** The page's address, with the trailing slash the static export uses. */
export const HOME_URL = `${SITE_URL}/`;

export const SITE_NAME = "Trade Huddle";

export const SITE_TITLE = "Fantasy Football Trade Analyzer for Sleeper | Trade Huddle";

export const SITE_DESCRIPTION =
  "Free NFL fantasy football trade analyzer and trade finder for Sleeper leagues. Get fair trade ideas that improve both teams, see every player's trade value and set your best weekly lineup.";

/** Link preview image (public/og.png), 1200 × 630. */
export const OG_IMAGE = {
  url: `${SITE_URL}/og.png`,
  width: 1200,
  height: 630,
  alt: "Trade Huddle: fantasy football trade analyzer for Sleeper leagues",
};

/** Structured data (schema.org) describing the site as a free web app. */
export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: HOME_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "SportsApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};
