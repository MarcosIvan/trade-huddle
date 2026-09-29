import type { NextConfig } from "next";

// On GitHub Pages the site lives under /<repo-name>. The deploy workflow sets
// NEXT_PUBLIC_BASE_PATH (e.g. "/trade-huddle"); locally it is empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
if (basePath && !/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error(`Invalid NEXT_PUBLIC_BASE_PATH: "${basePath}"`);
}

// The public address (e.g. https://<owner>.github.io/<repo>), for canonical links,
// link previews and the sitemap; the deploy workflow sets it.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
if (siteUrl && !/^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._-]+)*\/?$/.test(siteUrl)) {
  throw new Error(`Invalid NEXT_PUBLIC_SITE_URL: "${siteUrl}"`);
}
// Google Search Console ownership token (optional), placed in a meta tag.
const verification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";
if (verification && !/^[A-Za-z0-9_-]{10,100}$/.test(verification)) {
  throw new Error("Invalid NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION");
}

const nextConfig: NextConfig = {
  // Static HTML/JS only: no server, API routes, server actions or middleware.
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
