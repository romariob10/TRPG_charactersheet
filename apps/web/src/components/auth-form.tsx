"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthState } from "@/app/auth/actions";

type Mode = "sign-in" | "sign-up" | "reset" | "update";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: Mode;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState(action, {});
  const title = mode === "sign-in" ? t("signIn") : mode === "sign-up" ? t("signUp") : mode === "update" ? t("newPassword") : t("forgot");

  return (
    <form action={formAction} className="w-full space-y-5">
      <div>
        <h1 className="display-heading text-4xl text-[var(--brand)]">{title}</h1>
        {mode === "sign-in" && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t("noAccount")} <Link className="font-semibold text-[var(--brand)]" href="/auth/sign-up">{t("signUp")}</Link>
          </p>
        )}
        {mode === "sign-up" && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t("hasAccount")} <Link className="font-semibold text-[var(--brand)]" href="/auth/sign-in">{t("signIn")}</Link>
          </p>
        )}
      </div>
      {mode !== "update" && mode !== "reset" && (
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("email")}</span>
          <Input name="email" type="email" autoComplete="email" required />
        </label>
      )}
      {mode === "update" && (
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("currentPassword")}</span>
          <Input name="currentPassword" type="password" minLength={12} autoComplete="current-password" required />
        </label>
      )}
      {mode !== "reset" && (
        <label className="block space-y-2 text-sm font-semibold">
          <span>{mode === "update" ? t("newPassword") : t("password")}</span>
          <Input name={mode === "update" ? "newPassword" : "password"} type="password" minLength={12} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required />
        </label>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <p role="alert" className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-[var(--radius-control)] bg-emerald-50 p-3 text-sm text-emerald-800">{t("checkEmail")}</p>}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "…" : mode === "reset" ? t("reset") : t("submit")}
      </Button>
      {mode === "sign-in" && (
        <Link href="/auth/reset-password" className="block text-center text-sm font-semibold text-[var(--brand)]">{t("forgot")}</Link>
      )}
    </form>
  );
}
