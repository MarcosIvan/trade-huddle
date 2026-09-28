import type { NextConfig } from "next";

// On GitHub Pages the site lives under /<repo-name>. The deploy workflow sets
// NEXT_PUBLIC_BASE_PATH (e.g. "/trade-huddle"); locally it is empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
if (basePath && !/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error(`Invalid NEXT_PUBLIC_BASE_PATH: "${basePath}"`);
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
