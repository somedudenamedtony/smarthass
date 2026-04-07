import type { NextConfig } from "next";

const isHA = process.env.DEPLOY_MODE === "home-assistant";

const nextConfig: NextConfig = {
  output: "standalone",
  // In HA add-on mode, use relative asset paths so they resolve through
  // the Supervisor Ingress proxy (works with <base> tag injected at runtime)
  assetPrefix: isHA ? "." : undefined,
  async rewrites() {
    if (isHA) {
      // Serve /dashboard content at / so no redirect is needed.
      // Server-side redirects use absolute paths which break HA Ingress.
      return [{ source: "/", destination: "/dashboard" }];
    }
    return [];
  },
};

export default nextConfig;
