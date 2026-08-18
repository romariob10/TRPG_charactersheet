import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  user: AuthUser;
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    return (await apiFetch<AuthSession>("/api/auth/session")).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard/feed") {
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
