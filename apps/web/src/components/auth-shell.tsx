import { Logo } from "@/components/logo";
import { LanguageSwitch } from "@/components/language-switch";
import { useTranslations } from "next-intl";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Auth");
  return (
    <main className="grid min-h-screen bg-[var(--surface)] lg:grid-cols-[minmax(30rem,0.92fr)_1.08fr]">
      <section className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between"><Logo /><LanguageSwitch /></div>
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-12">{children}</div>
      </section>
      <section className="hidden bg-[var(--slate)] p-8 lg:flex xl:p-12">
        <div className="flex w-full flex-col justify-end rounded-[var(--radius-card)] bg-[var(--keylime)] p-10 xl:p-14">
          <p className="display-heading max-w-xl text-4xl text-[var(--brand)] xl:text-5xl">{t("exampleCommand")}</p>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)]">{t("productPromise")}</p>
        </div>
      </section>
    </main>
  );
}
