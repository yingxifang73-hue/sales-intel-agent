import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
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

export default withWorkflow(nextConfig);
