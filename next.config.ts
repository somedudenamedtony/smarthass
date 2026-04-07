import type { NextConfig } from "next";

const isHA = process.env.DEPLOY_MODE === "home-assistant";

const nextConfig: NextConfig = {
  output: "standalone",
  // In HA add-on mode, use relative asset paths so they resolve through
  // the Supervisor Ingress proxy (works with <base> tag injected at runtime)
  assetPrefix: isHA ? "." : undefined,
  async rewrites() {
    if (isHA) {
      // beforeFiles rewrites run BEFORE page matching.
      // Without this, src/app/page.tsx matches "/" first and its
      // redirect("/dashboard") sends an absolute Location header
      // that the browser resolves outside the Ingress proxy → 404.
      return {
        beforeFiles: [{ source: "/", destination: "/dashboard" }],
        afterFiles: [],
        fallback: [],
      };
    }
    return { beforeFiles: [], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
