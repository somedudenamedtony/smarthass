import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/components/theme-provider";

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
      suppressHydrationWarning
    >
      <head>
        {safeIngressPath && (
          <base href={`${safeIngressPath}/`} />
        )}
        {safeIngressPath && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var p="${safeIngressPath}";var f=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/"))u=p+u;return f.call(this,u,o)};document.addEventListener("click",function(e){if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;var a=e.target.closest&&e.target.closest("a");if(!a||(a.target&&a.target!=="_self"))return;var h=a.getAttribute("href");if(h&&h.startsWith("/")&&!h.startsWith(p+"/")){e.preventDefault();window.location.href=p+h}},true)})();`,
            }}
          />
        )}
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("smarthass-theme");if(t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches)){document.documentElement.classList.add("light")}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme="system">
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
