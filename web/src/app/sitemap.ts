import type { MetadataRoute } from "next";
import { HOME_URL } from "@/lib/site";

// Built once into out/sitemap.xml by the static export.
export const dynamic = "force-static";

/** The site is one page; ?demo and league links are the same page and are not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: HOME_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
