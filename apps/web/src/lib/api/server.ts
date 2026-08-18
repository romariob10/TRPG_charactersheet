import { headers } from "next/headers";
import { readResponseBody, toApiClientError } from "./client";

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API paths must be relative to the API origin.");
  }

  const incoming = await headers();
  const requestHeaders = new Headers(init.headers);
  const cookie = incoming.get("cookie");
  const defaultOrigin = process.env.PUBLIC_ORIGIN ?? "http://localhost:8080";
  const rawOrigin = incoming.get("origin") || incoming.get("referer") || defaultOrigin;
  let origin = defaultOrigin;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    origin = defaultOrigin;
  }
  if (cookie) requestHeaders.set("cookie", cookie);
  requestHeaders.set("origin", origin);
  if (init.body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const baseUrl = process.env.INTERNAL_API_URL ?? "http://api:4000";
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    cache: "no-store",
    headers: requestHeaders,
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw toApiClientError(response, body);
  return { data: body as T, headers: response.headers, status: response.status };
}
