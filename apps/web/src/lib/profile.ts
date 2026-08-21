import { cache } from "react";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile } from "@/lib/types";

// The shell renders the account menu on every authenticated page while the page
// itself often needs the same profile; cache() keeps that to one API call.
export const getMyProfile = cache(async function getMyProfile(): Promise<MyProfile> {
  return (await apiFetch<MyProfile>("/api/profiles/me")).data;
});
