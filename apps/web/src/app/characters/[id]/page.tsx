import { notFound } from "next/navigation";
import { CharacterEditor } from "@/components/editor/character-editor";
import { ProcessingCharacter } from "@/components/editor/processing-character";
import { getCharacterEditorData } from "@/lib/characters";

export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await getCharacterEditorData(id);
  if (!character) notFound();
  if (character.catalogStatus === "pending" || character.catalogStatus === "processing") {
    return <ProcessingCharacter character={character} />;
  }
  return <CharacterEditor initialCharacter={character} />;
}
