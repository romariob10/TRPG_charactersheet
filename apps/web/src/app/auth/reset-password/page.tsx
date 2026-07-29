import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";

export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth");
  return (
    <AuthShell>
      <section className="w-full space-y-4">
        <h1 className="display-heading text-4xl text-[var(--brand)]">{t("forgot")}</h1>
        <p className="rounded-[var(--radius-control)] bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {t("recoveryUnavailable")}
        </p>
      </section>
    </AuthShell>
  );
}
