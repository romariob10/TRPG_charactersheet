"use client";

import { useState } from "react";
import { Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export function CommunityAddButton({
  templateId,
  initialSubscribed,
  addLabel,
  removeLabel,
  pendingLabel,
  failedLabel,
}: {
  templateId: string;
  initialSubscribed: boolean;
  addLabel: string;
  removeLabel: string;
  pendingLabel: string;
  failedLabel: string;
}) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !subscribed;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/templates/${templateId}/subscription`, {
        method: next ? "POST" : "DELETE",
      });
      setSubscribed(next);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : failedLabel);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        variant={subscribed ? "secondary" : "primary"}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {subscribed ? <Check className="size-4" /> : <Users className="size-4" />}
        {pending ? pendingLabel : subscribed ? removeLabel : addLabel}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
