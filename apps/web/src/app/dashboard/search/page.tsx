import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { SearchView } from "@/components/search-view";
import { getSession } from "@/lib/auth";

export default async function SearchPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const locale = await getLocale();

  return (
    <main className="page-shell py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<div className="py-12 text-center text-sm font-semibold text-[var(--muted)]">Loading search…</div>}>
          <SearchView locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
