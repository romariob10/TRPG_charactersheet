import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile } from "@/lib/types";
import type { PostEmbedOptions } from "@/lib/use-post-editor";
import { FullPostEditor } from "@/components/full-post-editor";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const [profile, embedOptions] = await Promise.all([
    apiFetch<MyProfile>("/api/profiles/me"),
    apiFetch<PostEmbedOptions>("/api/posts/embed-options"),
  ]);

  return (
    <FullPostEditor
      profile={profile.data}
      embedOptions={embedOptions.data}
    />
  );
}
