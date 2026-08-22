"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Newspaper,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  SystemMaterial,
  SystemWorkspaceResponse,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function SystemWorkspaceView({
  workspace,
}: {
  workspace: SystemWorkspaceResponse;
}) {
  const t = useTranslations("SystemWorkspace");
  const [materials, setMaterials] = useState<SystemMaterial[]>(
    workspace.materials,
  );
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemId = workspace.system.id;

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError(t("selectFile"));
      return;
    }
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("title", title.trim() || file.name);
    try {
      const response = await fetch(`/api/systems/${systemId}/materials`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result?.error?.message ?? t("uploadFailed"),
        );
      }
      setMaterials((prev) => [result.material, ...prev]);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(material: SystemMaterial) {
    if (!confirm(t("confirmDeleteMaterial", { title: material.title }))) return;
    try {
      await apiFetch(`/api/systems/${systemId}/materials/${material.id}`, {
        method: "DELETE",
      });
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-8">
      {/* Sheet Definitions / Builder */}
      <section aria-labelledby="ws-sheets">
        <div className="flex items-center justify-between">
          <h2
            id="ws-sheets"
            className="flex items-center gap-2 text-lg font-bold text-[var(--brand)]"
          >
            <FileSpreadsheet className="size-4" /> Character Sheets & Layouts
          </h2>
          <Link
            href={`/dashboard/systems/${systemId}/sheets/new`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-strong)]"
          >
            <Plus className="size-3.5" /> New Sheet
          </Link>
        </div>

        {workspace.sheets && workspace.sheets.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspace.sheets.map((sheet) => (
              <li key={sheet.id}>
                <Link
                  href={`/dashboard/systems/${systemId}/sheets/${sheet.id}/builder`}
                  className="flex flex-col justify-between p-3.5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50 transition-all shadow-sm group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground group-hover:text-[var(--brand)] transition-colors truncate">
                        {sheet.title}
                      </span>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                        {sheet.kind}
                      </span>
                    </div>
                    {sheet.description && (
                      <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
                        {sheet.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border)]/60 text-[11px] text-[var(--muted)]">
                    <span>
                      {sheet.currentVersionNumber
                        ? `v${sheet.currentVersionNumber}`
                        : "Draft"}
                    </span>
                    <span className="text-[var(--brand)] font-semibold group-hover:underline">
                      Open Builder →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              No character sheet layouts created for this system yet.
            </p>
            <Link
              href={`/dashboard/systems/${systemId}/sheets/new`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-strong)]"
            >
              <Plus className="size-4" /> Create First Character Sheet
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="ws-characters">
        <h2
          id="ws-characters"
          className="flex items-center gap-2 text-lg font-bold text-[var(--brand)]"
        >
          <Users className="size-4" /> {t("characters")}
        </h2>
        {workspace.characters.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspace.characters.map((character) => (
              <li key={character.id}>
                <Link
                  href={`/characters/${character.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--brand)]/40"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--keylime)] text-[var(--brand)]">
                    <Users className="size-4" />
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {character.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">{t("emptyCharacters")}</p>
        )}
      </section>

      <section aria-labelledby="ws-posts">
        <h2
          id="ws-posts"
          className="flex items-center gap-2 text-lg font-bold text-[var(--brand)]"
        >
          <Newspaper className="size-4" /> {t("posts")}
        </h2>
        {workspace.posts.length ? (
          <ul className="mt-3 space-y-2">
            {workspace.posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/users/${post.authorUsername}/posts/${post.slug}`}
                  className="block rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--brand)]/40"
                >
                  <span className="block truncate text-sm font-semibold">
                    {post.title ?? post.excerpt}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                    @{post.authorUsername} · {post.excerpt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">{t("emptyPosts")}</p>
        )}
      </section>

      <section aria-labelledby="ws-materials">
        <h2
          id="ws-materials"
          className="flex items-center gap-2 text-lg font-bold text-[var(--brand)]"
        >
          <BookOpen className="size-4" /> {t("materials")}
        </h2>

        <form
          onSubmit={handleUpload}
          className="mt-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-semibold text-[var(--muted)]">
              {t("materialTitle")}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("materialTitlePlaceholder")}
                className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--muted)]">
              {t("materialFile")}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="mt-1 block w-full text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={uploading}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-strong)]",
                uploading && "opacity-60",
              )}
            >
              <Upload className="size-4" />
              {uploading ? t("uploading") : t("upload")}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>

        {materials.length ? (
          <ul className="mt-3 space-y-2">
            {materials.map((material) => (
              <li
                key={material.id}
                className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--keylime)] text-[var(--brand)]">
                  {material.fileType === "image" ? (
                    <ImageIcon className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <Link
                  href={material.url}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                >
                  {material.title}
                </Link>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {formatBytes(material.sizeBytes)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(material)}
                  aria-label={t("deleteMaterial")}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">{t("emptyMaterials")}</p>
        )}
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
