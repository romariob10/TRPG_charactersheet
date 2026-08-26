"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GameSystemSummary } from "@mycharacter/contracts";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export function AdminOfficialSystems({
  initialSystems,
}: {
  initialSystems: GameSystemSummary[];
}) {
  const t = useTranslations("AdminConsole.system");
  const [systems, setSystems] = useState(initialSystems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleOfficial(system: GameSystemSummary) {
    if (pendingId) return;
    const nextOfficial = !system.isOfficial;
    const previous = systems;

    setPendingId(system.id);
    setError(null);
    setSystems((items) =>
      items.map((item) =>
        item.id === system.id
          ? {
              ...item,
              isOfficial: nextOfficial,
              visibility: nextOfficial ? "public" : item.visibility,
            }
          : item,
      ),
    );

    try {
      const updated = await apiFetch<GameSystemSummary>(
        `/api/admin/game-systems/${system.id}/official`,
        {
          method: "PATCH",
          body: JSON.stringify({ isOfficial: nextOfficial }),
        },
      );
      setSystems((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setSystems(previous);
      setError(t("officialUpdateFailed"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <BadgeCheck className="size-5 text-[var(--brand)]" />
          {t("officialSystemsTitle")}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t("officialSystemsSubtitle")}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      {systems.length > 0 ? (
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {systems.map((system) => {
            const pending = pendingId === system.id;
            return (
              <div
                key={system.id}
                className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{system.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {system.owner?.username
                      ? `@${system.owner.username}`
                      : t("officialSystemWithoutOwner")}
                    {system.visibility === "public"
                      ? ` · ${t("officialSystemPublic")}`
                      : ` · ${t("officialSystemPrivate")}`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={system.isOfficial ? "primary" : "secondary"}
                  aria-pressed={system.isOfficial}
                  disabled={Boolean(pendingId)}
                  onClick={() => void toggleOfficial(system)}
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {system.isOfficial
                    ? t("officialMarked")
                    : t("officialMark")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-[var(--muted)]">
          {t("officialSystemsEmpty")}
        </p>
      )}
    </section>
  );
}
