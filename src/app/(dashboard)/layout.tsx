import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileNav, DesktopSidebar } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile nav */}
      <MobileNav />

      {/* Desktop sidebar */}
      <DesktopSidebar email={session.user.email ?? null} />

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
