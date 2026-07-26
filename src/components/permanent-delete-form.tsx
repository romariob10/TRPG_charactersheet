"use client";

import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { permanentlyDeleteCharacter } from "@/app/dashboard/actions";

function DeleteButton() {
  const t = useTranslations("Dashboard");
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
    >
      <Trash2 className="size-4" />
      {pending ? t("deletingForever") : t("deleteForever")}
    </button>
  );
}

export function PermanentDeleteForm({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const t = useTranslations("Dashboard");

  return (
    <form
      action={permanentlyDeleteCharacter}
      onSubmit={(event) => {
        if (
          !window.confirm(t("deleteForeverConfirm", { name: characterName }))
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="characterId" value={characterId} />
      <DeleteButton />
    </form>
  );
}
