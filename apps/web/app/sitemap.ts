import type { MetadataRoute } from "next";
import { absoluteUrl } from "~~/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/login"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/auth/producer"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
