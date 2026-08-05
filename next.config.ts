import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{
      source: "/",
      headers: [{
        key: "Cache-Control",
        value: "no-store, max-age=0, must-revalidate",
      }],
    }];
  },
};

export default nextConfig;
