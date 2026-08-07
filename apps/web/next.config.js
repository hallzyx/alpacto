// @ts-check
const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Monorepo: standalone output nests under apps/web (matches Dockerfile.web).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
};

module.exports = nextConfig;
