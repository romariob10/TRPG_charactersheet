import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { SystemWorkspaceResponse } from "@mycharacter/contracts";
import { SystemWorkspaceView } from "@/components/system-workspace-view";
import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SystemWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getSession())) redirect("/auth/sign-in");

  let workspace: SystemWorkspaceResponse;
  try {
    ({ data: workspace } = await apiFetch<SystemWorkspaceResponse>(
      `/api/systems/${id}/workspace`,
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

  const t = await getTranslations("SystemWorkspace");

  return (
    <main className="page-shell py-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {t("eyebrow")}
        </p>
        <h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">
          {workspace.system.title}
        </h1>
        {workspace.system.gameSystem && (
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {workspace.system.gameSystem}
          </p>
        )}
      </header>
      <SystemWorkspaceView workspace={workspace} />
    </main>
  );
}
