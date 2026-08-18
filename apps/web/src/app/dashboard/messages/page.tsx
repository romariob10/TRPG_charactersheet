import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { ListConversationsResponse } from "@mycharacter/contracts";
import { DirectMessagesView } from "@/components/direct-messages-view";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";
import type { MyProfile } from "@/lib/types";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const { conversationId } = await searchParams;

  const [conversationsRes, myProfile, locale] = await Promise.all([
    apiFetch<ListConversationsResponse>("/api/messages/conversations"),
    apiFetch<MyProfile>("/api/profiles/me"),
    getLocale(),
  ]);

  return (
    <main className="page-shell py-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <DirectMessagesView
          initialConversations={conversationsRes.data.conversations}
          currentUserId={myProfile.data.id}
          locale={locale}
          initialConversationId={conversationId}
        />
      </div>
    </main>
  );
}
