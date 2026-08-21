import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CharacterEditor } from "@/components/editor/character-editor";
import { ProcessingCharacter } from "@/components/editor/processing-character";
import { getSession } from "@/lib/auth";
import { getCharacterEditorData } from "@/lib/characters";

export const dynamic = "force-dynamic";

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getSession())) redirect("/auth/sign-in");

  const character = await getCharacterEditorData(id);
  if (!character) notFound();
  if (
    character.catalogStatus === "pending" ||
    character.catalogStatus === "processing"
  ) {
    return <ProcessingCharacter character={character} />;
  }
  return (
    <AppShell>
      <CharacterEditor initialCharacter={character} />
    </AppShell>
  );
}
