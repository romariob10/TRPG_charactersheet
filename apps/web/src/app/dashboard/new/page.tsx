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

  const [ownedSystemsRes, officialSystemsRes, templatesRes] = await Promise.all([
    apiFetch<GameSystemSummary[]>("/api/game-systems?scope=mine").catch(() => ({ data: [] as GameSystemSummary[] })),
    apiFetch<GameSystemSummary[]>("/api/game-systems?scope=official").catch(() => ({ data: [] as GameSystemSummary[] })),
    apiFetch<{ items: TemplateSummary[] }>("/api/templates?scope=creation").catch(() => ({ data: { items: [] as TemplateSummary[] } })),
  ]);

  const ownedSystems = ownedSystemsRes.data ?? [];
  const ownedSystemIds = new Set(ownedSystems.map((system) => system.id));
  const officialSystems = (officialSystemsRes.data ?? []).filter(
    (system) => !ownedSystemIds.has(system.id),
  );
  const templates = templatesRes.data?.items ?? [];

  // For each game system, fetch workspace to discover published sheets
  const sources: CharacterCreationSource[] = [];

  const systemGroups = [
    { systems: ownedSystems, group: "mine" as const },
    { systems: officialSystems, group: "official" as const },
  ];
  for (const { systems, group } of systemGroups) {
    const workspaces = await Promise.all(
      systems.map(async (system) => {
        try {
          const workspace = await apiFetch<UnifiedGameSystemWorkspace>(
            `/api/game-systems/${system.id}/workspace`,
          );
          return { system, workspace: workspace.data };
        } catch {
          return null;
        }
      }),
    );
    for (const item of workspaces) {
      if (!item) continue;
      for (const sheet of item.workspace.sheets) {
        if (!sheet.currentVersionId) continue;
        sources.push({
          type: "sheet",
          group,
          id: sheet.currentVersionId,
          sheetVersionId: sheet.currentVersionId,
          systemId: item.system.id,
          title: `${item.system.title} — ${sheet.title}`,
          systemTitle: item.system.title,
          sheetTitle: sheet.title,
          versionNumber: sheet.currentVersionNumber ?? 1,
        });
      }
    }
  }

  // Add legacy templates
  for (const template of templates) {
    sources.push({
      type: "template",
      group: template.subscribed
        ? "saved"
        : template.author
          ? "mine"
          : "official",
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
