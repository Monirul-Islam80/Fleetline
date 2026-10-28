import type { NextConfig } from "next";

/** In live mode, /api/* is proxied to the Go backend so the console and API share one origin (no CORS, cookies work). */
const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_MODE !== "live") return [];
    return [{ source: "/api/:path*", destination: `${backend}/api/v1/:path*` }];
  },
};

export default nextConfig;
