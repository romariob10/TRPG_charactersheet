"use client";

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function FollowButton({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const t = useTranslations("Common");
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      await apiFetch(`/api/profiles/${username}/follow`, {
        method: next ? "PUT" : "DELETE",
      });
    } catch {
      setFollowing(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={following ? "secondary" : "primary"}
      disabled={pending}
      onClick={() => void toggle()}
      aria-pressed={following}
    >
      {following ? <Check className="size-4" /> : <UserPlus className="size-4" />}
      {following ? t("following") : t("follow")}
    </Button>
  );
}
