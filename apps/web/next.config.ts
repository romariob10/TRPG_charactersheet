import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "app.mycharacter.orb.local",
    "web.mycharacter.orb.local",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async rewrites() {
    const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://api:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
  // PDF.js resolves its worker relative to its own package at runtime. Bundling
  // the server import into a Next.js chunk breaks that relative lookup.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
  webpack(config) {
    config.resolve.alias.canvas = false;
    return config;
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
