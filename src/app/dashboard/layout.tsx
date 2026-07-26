import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <SiteHeader authenticated />
      {children}
    </div>
  );
}
