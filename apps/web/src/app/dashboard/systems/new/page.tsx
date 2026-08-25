import { getTranslations } from "next-intl/server";
import { CreateSystemForm } from "@/components/create-system-form";

export default async function NewSystemPage() {
  const t = await getTranslations("Systems");
  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:px-8">
      <h1 className="display-heading text-4xl text-[var(--brand)]">{t("newTitle") || "Create Game System"}</h1>
      <p className="mt-2 text-[var(--muted)]">{t("newIntro") || "Enter the title of your game system to start designing your character sheet."}</p>
      <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
        <CreateSystemForm />
      </div>
    </main>
  );
}
