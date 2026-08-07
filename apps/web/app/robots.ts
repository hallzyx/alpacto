import type { MetadataRoute } from "next";
import { absoluteUrl } from "~~/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/auth/producer"],
      disallow: ["/admin", "/buyer", "/producer", "/association", "/inspector"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
