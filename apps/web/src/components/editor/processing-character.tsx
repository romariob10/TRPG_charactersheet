"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CharacterEditorData } from "@/lib/types";

export function ProcessingCharacter({ character }: { character: CharacterEditorData }) {
  const router = useRouter();
  const t = useTranslations("Editor");
  const [progress, setProgress] = useState(8);
  const step = t("processingStep");
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/realtime`,
    );
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: "subscribe",
          characterId: character.id,
          afterRevision: character.revision,
        }),
      );
    });
    socket.addEventListener("message", (message) => {
      try {
        const next = JSON.parse(String(message.data)) as {
          type?: string;
          templateId?: string;
          progress?: number;
          status?: string;
        };
        if (
          next.type !== "catalog.progress" ||
          next.templateId !== character.templateId
        ) {
          return;
        }
        setProgress(Math.round((next.progress ?? 0) * 100));
        if (["ready", "partial", "failed"].includes(next.status ?? "")) {
          router.refresh();
        }
      } catch {
        // The HTTP refresh below is the recovery path for malformed messages.
      }
    });
    const heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ protocolVersion: 1, type: "heartbeat" }));
      }
    }, 15_000);
    const poll = window.setInterval(() => router.refresh(), 15_000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(poll);
      socket.close();
    };
  }, [character.id, character.revision, character.templateId, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--keylime)] p-6">
      <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7 text-center sm:p-8">
        <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]"><FileSearch className="size-7" /></div>
        <h1 className="display-heading mt-6 text-3xl text-[var(--brand)]">{t("processingTitle", { name: character.name })}</h1>
        <p className="mt-2 text-[var(--muted)]">{t("processingText")}</p>
        <div className="mt-7 h-2 overflow-hidden rounded-full bg-black/8"><div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="size-4 animate-spin" />{step}</div>
      </div>
    </main>
  );
}
