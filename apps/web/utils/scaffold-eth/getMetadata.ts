import type { Metadata } from "next";
import { buildPageMetadata } from "~~/lib/metadata";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/og-image.png",
  noIndex = false,
}: {
  title: string;
  description: string;
  imageRelativePath?: string;
  noIndex?: boolean;
}): Metadata =>
  buildPageMetadata({
    title,
    description,
    imagePath: imageRelativePath,
    noIndex,
  });
