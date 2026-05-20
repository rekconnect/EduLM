import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes: disabled until the route structure stabilizes (Phase 1+).
  experimental: {
    // Client router cache lifetimes. Default in Next.js 16 is 0s for dynamic
    // segments, which makes the browser Back button refetch every page — feels
    // sluggish on slow links. 30s/180s lets back navigation reuse the cached
    // RSC payload (instant) while keeping data freshness reasonable. New
    // forward navigations still always fetch fresh.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default withNextIntl(nextConfig);
