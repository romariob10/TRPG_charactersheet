import Link from "next/link";
import { ArrowRight, FileCheck2, ScanSearch, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { buttonClassName } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [t, session] = await Promise.all([
    getTranslations("Landing"),
    getSession(),
  ]);
  const authenticated = Boolean(session);
  const features = [
    { icon: ScanSearch, title: t("catalog"), text: t("catalogText") },
    { icon: UsersRound, title: t("collab"), text: t("collabText") },
    { icon: FileCheck2, title: t("export"), text: t("exportText") },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader authenticated={authenticated} />
      <main>
        <section className="overflow-hidden border-b border-[var(--border)] bg-[var(--background)]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.03fr_.97fr] lg:py-24">
            <div>
              <div className="mb-5 text-[11px] font-semibold tracking-[.1em] text-[var(--brand)] uppercase">
                {t("eyebrow")}
              </div>
              <h1 className="display-heading max-w-3xl text-[clamp(3rem,5.4vw,4.75rem)] text-[var(--brand)]">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-7 text-[var(--muted)]">{t("description")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href={authenticated ? "/dashboard/new" : "/auth/sign-up"} className={buttonClassName({ size: "lg" })}>
                  {t("primary")} <ArrowRight className="size-4" />
                </Link>
                <Link href={authenticated ? "/dashboard/feed" : "/auth/sign-in"} className={buttonClassName({ variant: "secondary", size: "lg" })}>
                  {authenticated ? t("dashboard") : t("secondary")}
                </Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-xl rounded-[var(--radius-card)] bg-[var(--slate)] p-4 sm:p-5">
                <div className="rounded-[var(--radius-card)] border border-white/70 bg-[var(--surface)] p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <div className="text-xs font-semibold tracking-[.18em] text-[var(--muted)] uppercase">Character sheet</div>
                      <div className="mt-1 text-2xl font-bold">Arven Nightwind</div>
                    </div>
                    <div className="grid size-13 place-items-center rounded-full border-2 border-[var(--accent)] text-lg font-bold">17</div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[t("strength"), t("dexterity"), t("constitution")].map((label, index) => (
                      <div key={label} className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-center">
                        <div className="text-xs text-[var(--muted)]">{label}</div>
                        <div className="mt-1 text-2xl font-bold">{[14, 18, 12][index]}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-[var(--radius-control)] bg-[var(--keylime)] p-4 text-sm">
                    <strong>AI:</strong> {t("sampleCommand")}
                    <div className="mt-3 flex gap-2">
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">Mirror Image</span>
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">Misty Step</span>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="grid overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--keylime)] md:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="border-b border-[var(--border)] p-6 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0 lg:p-7">
                <div className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-[var(--mint-veil)] text-[var(--brand)]">
                  <Icon className="size-5" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-[var(--brand)]">{title}</h2>
                <p className="mt-2 max-w-sm leading-7 text-[var(--muted)]">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
