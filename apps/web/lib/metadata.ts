import type { Metadata } from "next";
import { absoluteUrl, getSiteUrl, siteConfig } from "./site";

type PageMetadataInput = {
  title?: string;
  description?: string;
  path?: string;
  imagePath?: string;
  noIndex?: boolean;
};

const titleTemplate = `%s · ${siteConfig.name}`;

function resolveTitle(title?: string): string {
  if (!title || title === siteConfig.name) {
    return `${siteConfig.name} — ${siteConfig.tagline}`;
  }
  return title;
}

export function buildPageMetadata({
  title,
  description = siteConfig.description,
  path = "/",
  imagePath = siteConfig.ogImagePath,
  noIndex = false,
}: PageMetadataInput = {}): Metadata {
  const resolvedTitle = resolveTitle(title);
  const canonical = absoluteUrl(path);
  const imageUrl = absoluteUrl(imagePath);

  return {
    title: title ? { absolute: resolvedTitle } : resolvedTitle,
    description,
    keywords: [...siteConfig.keywords],
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.name, url: getSiteUrl() }],
    creator: siteConfig.name,
    publisher: siteConfig.name,
    category: "technology",
    alternates: {
      canonical,
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: canonical,
      siteName: siteConfig.name,
      title: resolvedTitle,
      description,
      images: [
        {
          url: imageUrl,
          width: 1536,
          height: 1024,
          alt: `${siteConfig.name} — paisaje del altiplano andino con alpacas`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [imageUrl],
    },
    icons: {
      icon: [{ url: siteConfig.faviconPath, sizes: "32x32", type: "image/png" }],
      shortcut: [siteConfig.faviconPath],
      apple: [{ url: siteConfig.faviconPath }],
    },
    manifest: siteConfig.manifestPath,
    other: {
      "theme-color": siteConfig.themeColor,
    },
  };
}

export function buildRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: `${siteConfig.name} — ${siteConfig.tagline}`,
      template: titleTemplate,
    },
    description: siteConfig.description,
    keywords: [...siteConfig.keywords],
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.name, url: getSiteUrl() }],
    creator: siteConfig.name,
    publisher: siteConfig.name,
    category: "technology",
    alternates: {
      canonical: getSiteUrl(),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: getSiteUrl(),
      siteName: siteConfig.name,
      title: `${siteConfig.name} — ${siteConfig.tagline}`,
      description: siteConfig.description,
      images: [
        {
          url: absoluteUrl(siteConfig.ogImagePath),
          width: 1536,
          height: 1024,
          alt: `${siteConfig.name} — paisaje del altiplano andino con alpacas`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteConfig.name} — ${siteConfig.tagline}`,
      description: siteConfig.description,
      images: [absoluteUrl(siteConfig.ogImagePath)],
    },
    icons: {
      icon: [{ url: siteConfig.faviconPath, sizes: "32x32", type: "image/png" }],
      shortcut: [siteConfig.faviconPath],
      apple: [{ url: siteConfig.faviconPath }],
    },
    manifest: siteConfig.manifestPath,
    other: {
      "theme-color": siteConfig.themeColor,
    },
  };
}
