import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The repository also contains a legacy application at its outer root.
  // Pin Turbopack to this application so it never discovers that app's
  // obsolete Vercel Workflow dependency while building the Render service.
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
