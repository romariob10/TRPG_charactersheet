import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { acceptInvite } from "@/app/invites/actions";
import { getOptionalUser } from "@/lib/supabase/auth";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  const t = await getTranslations("Invite");
  const { user } = await getOptionalUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/invites/${token}`)}`);
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--keylime)] p-5">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7 text-center sm:p-8">
        <Logo className="justify-center" />
        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-[var(--radius-card)] bg-[var(--brand-soft)] text-[var(--brand)]"><UserPlus className="size-7" /></div>
        <h1 className="display-heading mt-5 text-3xl text-[var(--brand)]">{t("title")}</h1>
        <p className="mt-2 leading-7 text-[var(--muted)]">{t("description")}</p>
        {error && <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">{t("invalid")}</p>}
        <form action={acceptInvite} className="mt-6"><input type="hidden" name="token" value={token} /><Button className="w-full" size="lg">{t("accept")}</Button></form>
      </div>
    </main>
  );
}
