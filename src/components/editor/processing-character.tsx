"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { CharacterEditorData } from "@/lib/types";

export function ProcessingCharacter({ character }: { character: CharacterEditorData }) {
  const router = useRouter();
  const t = useTranslations("Editor");
  const [progress, setProgress] = useState(8);
  const [step, setStep] = useState(t("processingStep"));
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`catalog:${character.templateId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "catalog_jobs", filter: `template_id=eq.${character.templateId}` }, (payload: { new: Record<string, unknown> }) => {
        const next = payload.new as { progress?: number; current_step?: string; status?: string };
        setProgress((current) => next.progress ?? current); setStep((current) => next.current_step ?? current);
        if (["ready", "partial", "failed"].includes(next.status ?? "")) router.refresh();
      }).subscribe();
    const poll = window.setInterval(() => router.refresh(), 10_000);
    return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
  }, [character.templateId, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--keylime)] p-6">
      <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7 text-center sm:p-8">
        <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]"><FileSearch className="size-7" /></div>
        <h1 className="display-heading mt-6 text-3xl text-[var(--brand)]">{t("processingTitle", { name: character.name })}</h1>
        <p className="mt-2 text-[var(--muted)]">{t("processingText")}</p>
        <div className="mt-7 h-2 overflow-hidden rounded-full bg-black/8"><div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="size-4 animate-spin" />{step}</div>
      </div>
    </main>
  );
}
