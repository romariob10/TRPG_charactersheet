"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { renameCharacter } from "@/app/dashboard/actions";

function RenameActions({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("Dashboard");
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        className="grid size-8 place-items-center rounded-[7px] hover:bg-[var(--keylime)]"
        aria-label={t("cancelRename")}
        onClick={onCancel}
      >
        <X className="size-4" />
      </button>
      <button
        type="submit"
        disabled={pending}
        className="grid size-8 place-items-center rounded-[7px] bg-[var(--brand)] text-white disabled:opacity-60"
        aria-label={t("saveName")}
      >
        <Check className="size-4" />
      </button>
    </div>
  );
}

export function RenameCharacterForm({
  characterId,
  currentName,
}: {
  characterId: string;
  currentName: string;
}) {
  const t = useTranslations("Dashboard");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)]"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
        {t("rename")}
      </button>
    );
  }

  return (
    <form action={renameCharacter} className="space-y-2 p-1.5">
      <input type="hidden" name="characterId" value={characterId} />
      <label
        className="block text-xs font-semibold"
        htmlFor={`rename-${characterId}`}
      >
        {t("characterName")}
      </label>
      <input
        id={`rename-${characterId}`}
        name="name"
        required
        maxLength={120}
        defaultValue={currentName}
        autoFocus
        className="h-9 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm outline-none focus:border-[var(--brand)]"
      />
      <RenameActions onCancel={() => setEditing(false)} />
    </form>
  );
}
