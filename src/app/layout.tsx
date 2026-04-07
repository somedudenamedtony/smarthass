import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartHass",
  description: "AI-Powered Home Assistant Companion",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the Ingress path set by HA Supervisor (e.g. /api/hassio_ingress/<token>)
  const headersList = await headers();
  const ingressPath = headersList.get("x-ingress-path") || "";
  // Validate format to prevent injection
  const safeIngressPath =
    ingressPath && /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+$/.test(ingressPath)
      ? ingressPath
      : "";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {safeIngressPath && (
          <base href={`${safeIngressPath}/`} />
        )}
        {safeIngressPath && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var p="${safeIngressPath}";var f=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/"))u=p+u;return f.call(this,u,o)};})();`,
            }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
