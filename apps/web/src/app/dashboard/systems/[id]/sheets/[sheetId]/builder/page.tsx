import { notFound, redirect } from "next/navigation";
import type { SheetEditorDataResponse } from "@mycharacter/contracts";
import { SheetBuilderMain } from "@/components/sheet/builder/sheet-builder-main";
import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SheetBuilderPage({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>;
}) {
  const { id: systemId, sheetId } = await params;
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  let editorData: SheetEditorDataResponse;
  try {
    ({ data: editorData } = await apiFetch<SheetEditorDataResponse>(
      `/api/sheet-definitions/${sheetId}/editor`,
    ));
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      (error.status === 404 || error.status === 403)
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="w-full h-full">
      <SheetBuilderMain initialData={editorData} systemId={systemId} />
    </main>
  );
}
