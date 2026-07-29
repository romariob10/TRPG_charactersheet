import { getTranslations } from "next-intl/server";
import { TemplateUploadForm } from "@/components/template-upload-form";

export default async function NewSystemTemplatePage() {
  const t = await getTranslations("Systems");
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="display-heading text-4xl text-[var(--brand)]">{t("newTitle")}</h1>
      <p className="mt-2 text-[var(--muted)]">{t("newIntro")}</p>
      <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--keylime)] p-5 sm:p-7">
        <TemplateUploadForm />
      </div>
    </main>
  );
}
