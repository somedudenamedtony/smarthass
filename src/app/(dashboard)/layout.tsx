import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileNav, DesktopSidebar } from "@/components/dashboard/nav";
import { isHomeAssistant } from "@/lib/config";

// Prevent static prerendering — auth() depends on a live database at runtime
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    // In HA mode, redirect to /setup to trigger auto-setup
    // In standard mode, redirect to login
    redirect(isHomeAssistant() ? "/setup" : "/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile nav */}
      <MobileNav />

      {/* Desktop sidebar */}
      <DesktopSidebar email={session.user.email ?? null} />

      {/* Main content - extra bottom padding on mobile for bottom nav */}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
