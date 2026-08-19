"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export function SendMessageButton({
  recipientUsername,
}: {
  recipientUsername: string;
}) {
  const t = useTranslations("DirectMessages");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await apiFetch<{ conversationId: string }>(
        "/api/messages/conversations",
        {
          method: "POST",
          body: JSON.stringify({ recipientUsername }),
        },
      );
      router.push(`/dashboard/messages?conversationId=${res.conversationId}`);
    } catch {
      router.push("/dashboard/messages");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={loading}
      onClick={() => void handleStart()}
      className="inline-flex items-center gap-1.5"
    >
      <MessageSquare className="size-4" />
      <span>{t("sendMessage")}</span>
    </Button>
  );
}
