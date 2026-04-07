import type { NextConfig } from "next";

const isHA = process.env.DEPLOY_MODE === "home-assistant";

const nextConfig: NextConfig = {
  output: "standalone",
  // In HA add-on mode, use relative asset paths so they resolve through
  // the Supervisor Ingress proxy (works with <base> tag injected at runtime)
  assetPrefix: isHA ? "." : undefined,
  async rewrites() {
    if (isHA) {
      return {
        beforeFiles: [
          // Serve /dashboard content at / so no redirect is needed.
          { source: "/", destination: "/dashboard" },
          // assetPrefix:"." produces relative paths like ./_next/...
          // On subpages (e.g. /dashboard/top-entities) the browser resolves
          // them relative to the current URL path BEFORE seeing the <base> tag
          // (Next.js places CSS <link> tags before user <head> content).
          // This catches misresolved paths like /dashboard/_next/... and
          // rewrites them to the correct /_next/... location.
          {
            source: "/:path*/_next/:asset*",
            destination: "/_next/:asset*",
          },
        ],
        afterFiles: [],
        fallback: [],
      };
    }
    return { beforeFiles: [], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
