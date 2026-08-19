import type { AnalyticsSummary } from "@mycharacter/contracts";
import { AdminAnalyticsView } from "@/components/admin-analytics-view";
import { apiFetch } from "@/lib/api/server";

export default async function AdminAnalyticsPage() {
  const summary = await apiFetch<AnalyticsSummary>("/api/admin/analytics?period=30d");

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <AdminAnalyticsView initialSummary={summary.data} />
    </section>
  );
}
