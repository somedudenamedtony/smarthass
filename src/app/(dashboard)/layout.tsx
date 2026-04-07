import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileNav, DesktopSidebar } from "@/components/dashboard/nav";
import { isHomeAssistant } from "@/lib/config";

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

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 relative overflow-x-hidden">
        {/* Background ambient glow */}
        <div className="fixed top-0 right-0 w-96 h-96 bg-primary/3 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 left-64 w-72 h-72 bg-chart-3/3 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
