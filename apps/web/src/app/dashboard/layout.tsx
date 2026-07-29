import { SiteHeader } from "@/components/site-header";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) redirect("/auth/sign-in");
  return (
    <div className="min-h-screen">
      <SiteHeader authenticated />
      {children}
    </div>
  );
}
