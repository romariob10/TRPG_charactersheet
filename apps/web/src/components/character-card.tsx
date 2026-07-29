import Link from "next/link";
import {
  Copy,
  FileText,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { CharacterSummary } from "@/lib/types";
import {
  cloneCharacter,
  restoreCharacter,
  trashCharacter,
} from "@/app/dashboard/actions";
import { buttonClassName } from "@/components/ui/button";
import { PermanentDeleteForm } from "@/components/permanent-delete-form";
import { RenameCharacterForm } from "@/components/rename-character-form";
import { cn, formatRelativeDate } from "@/lib/utils";

export function CharacterCard({
  character,
  locale,
}: {
  character: CharacterSummary;
  locale: string;
}) {
  const t = useTranslations("Dashboard");
  const active = character.status === "active";
  const catalogComplete = ["ready", "partial"].includes(
    character.catalogStatus,
  );
  return (
    <article
      className={cn(
        "group relative rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand)]/35 has-[details[open]]:z-20",
        active && "cursor-pointer",
      )}
    >
      {active && (
        <Link
          href={`/characters/${character.id}`}
          className="absolute inset-0 z-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          aria-label={t("openCharacter", { name: character.name })}
        />
      )}
      <div className="pointer-events-none relative z-20 flex items-start justify-between gap-4">
        <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--mint-veil)] text-[var(--brand)]">
          <FileText className="size-6" />
        </div>
        <details className="pointer-events-auto relative z-30">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[var(--radius-control)] hover:bg-[var(--keylime)]">
            <MoreHorizontal className="size-5" />
          </summary>
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-overlay)]">
            {active && character.role === "owner" && (
              <>
                <RenameCharacterForm
                  characterId={character.id}
                  currentName={character.name}
                />
                <form action={cloneCharacter}>
                  <input
                    type="hidden"
                    name="characterId"
                    value={character.id}
                  />
                  <button className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)]">
                    <Copy className="size-4" />
                    {t("clone")}
                  </button>
                </form>
                <form action={trashCharacter}>
                  <input
                    type="hidden"
                    name="characterId"
                    value={character.id}
                  />
                  <button className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">
                    <Trash2 className="size-4" />
                    {t("moveToTrash")}
                  </button>
                </form>
              </>
            )}
            {!active && character.role === "owner" && (
              <>
                <form action={restoreCharacter}>
                  <input
                    type="hidden"
                    name="characterId"
                    value={character.id}
                  />
                  <button className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)]">
                    <RotateCcw className="size-4" />
                    {t("restoreAction")}
                  </button>
                </form>
                <PermanentDeleteForm
                  characterId={character.id}
                  characterName={character.name}
                />
              </>
            )}
          </div>
        </details>
      </div>
      <h2 className="pointer-events-none relative z-10 mt-5 truncate text-xl font-bold">
        {character.name}
      </h2>
      <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-black/5 px-2.5 py-1">
          {t(character.role)}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            catalogComplete
              ? "bg-emerald-50 text-emerald-800"
              : character.catalogStatus === "failed"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-800",
          )}
        >
          {t(
            catalogComplete
              ? "ready"
              : character.catalogStatus === "failed"
                ? "failed"
                : "processing",
          )}
        </span>
        <span className="text-[var(--muted)]">
          {t("pages", { count: character.pageCount })}
        </span>
      </div>
      <div className="pointer-events-none relative z-10 mt-6 flex items-center justify-between border-t pt-4">
        <span className="text-xs text-[var(--muted)]">
          {formatRelativeDate(character.updatedAt, locale)}
        </span>
        {active && (
          <span
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            {t("open")}
          </span>
        )}
      </div>
    </article>
  );
}
