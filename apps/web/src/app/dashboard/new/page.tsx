import { getTranslations } from "next-intl/server";
import { CreateCharacterForm, type CharacterCreationSource } from "@/components/create-character-form";
import { apiFetch } from "@/lib/api/server";
import type { GameSystemSummary, UnifiedGameSystemWorkspace } from "@mycharacter/contracts";
import type { TemplateSummary } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{
    systemId?: string;
    sheetVersionId?: string;
    templateId?: string;
  }>;
}

export default async function NewCharacterPage({ searchParams }: PageProps) {
  const t = await getTranslations("Create");
  const params = await searchParams;

  const [systemsRes, templatesRes] = await Promise.all([
    apiFetch<GameSystemSummary[]>("/api/game-systems").catch(() => ({ data: [] as GameSystemSummary[] })),
    apiFetch<{ items: TemplateSummary[] }>("/api/templates?scope=creation").catch(() => ({ data: { items: [] as TemplateSummary[] } })),
  ]);

  const systems = systemsRes.data ?? [];
  const templates = templatesRes.data?.items ?? [];

  // For each game system, fetch workspace to discover published sheets
  const sources: CharacterCreationSource[] = [];

  for (const sys of systems) {
    try {
      const ws = await apiFetch<UnifiedGameSystemWorkspace>(`/api/game-systems/${sys.id}/workspace`);
      if (ws.data?.sheets) {
        for (const sheet of ws.data.sheets) {
          if (sheet.currentVersionId) {
            sources.push({
              type: "sheet",
              id: sheet.currentVersionId,
              sheetVersionId: sheet.currentVersionId,
              systemId: sys.id,
              title: `${sys.title} — ${sheet.title}`,
              systemTitle: sys.title,
              sheetTitle: sheet.title,
              versionNumber: sheet.currentVersionNumber ?? 1,
            });
          }
        }
      }
    } catch {}
  }

  // Add legacy templates
  for (const template of templates) {
    sources.push({
      type: "template",
      id: template.id,
      templateId: template.id,
      title: template.title,
      systemTitle: template.gameSystem ?? "PDF Template",
      pageCount: template.pageCount,
      community: Boolean(template.subscribed),
    });
  }

  const initialSelectedId =
    params.sheetVersionId ||
    params.templateId ||
    (params.systemId
      ? sources.find(
          (s): s is Extract<CharacterCreationSource, { type: "sheet" }> =>
            s.type === "sheet" && s.systemId === params.systemId,
        )?.id
      : undefined);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="display-heading text-4xl text-[var(--brand)]">{t("title")}</h1>
      <p className="mt-2 text-[var(--muted)]">{t("intro")}</p>
      <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7 shadow-sm">
        <CreateCharacterForm sources={sources} initialSelectedId={initialSelectedId} />
      </div>
    </main>
  );
}
