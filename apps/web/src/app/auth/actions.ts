"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api/server";
import { safeRedirectPath } from "@/lib/auth";

export type AuthState = { error?: string; success?: string };

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const response = await apiFetch<{ user: unknown }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await copyResponseCookies(response.headers);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  redirect(safeRedirectPath(String(formData.get("next") ?? "")));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const response = await apiFetch<{ user: unknown }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await copyResponseCookies(response.headers);
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect("/dashboard");
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  try {
    const response = await apiFetch<{ user: unknown }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await copyResponseCookies(response.headers);
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect("/dashboard");
}

export async function signOut() {
  try {
    const response = await apiFetch<void>("/api/auth/logout", { method: "POST" });
    await copyResponseCookies(response.headers);
  } catch {
    await clearLocalSessionCookie();
  }
  redirect("/");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed.";
}

async function copyResponseCookies(responseHeaders: Headers) {
  const store = await cookies();
  for (const value of getSetCookieHeaders(responseHeaders)) {
    const parsed = parseSetCookie(value);
    if (parsed) store.set(parsed.name, parsed.value, parsed.options);
  }
}

async function clearLocalSessionCookie() {
  const store = await cookies();
  store.set("mycharacter_session", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });
}

function getSetCookieHeaders(responseHeaders: Headers) {
  const getSetCookie = (responseHeaders as Headers & {
    getSetCookie?: () => string[];
  }).getSetCookie;
  const values = getSetCookie?.call(responseHeaders);
  if (values?.length) return values;
  const value = responseHeaders.get("set-cookie");
  return value ? [value] : [];
}

function parseSetCookie(value: string) {
  const [first, ...attributes] = value.split(";");
  const separator = first.indexOf("=");
  if (separator <= 0) return null;
  const name = first.slice(0, separator).trim();
  const cookieValue = first.slice(separator + 1).trim();
  if (!name) return null;

  const options: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "lax" | "none" | "strict";
    secure?: boolean;
  } = {};
  for (const attribute of attributes) {
    const [rawName, ...rawValue] = attribute.trim().split("=");
    const attributeName = rawName.toLowerCase();
    const attributeValue = rawValue.join("=");
    if (attributeName === "domain") options.domain = attributeValue;
    if (attributeName === "path") options.path = attributeValue;
    if (attributeName === "httponly") options.httpOnly = true;
    if (attributeName === "secure") options.secure = true;
    if (attributeName === "max-age") {
      const maxAge = Number(attributeValue);
      if (Number.isFinite(maxAge)) options.maxAge = maxAge;
    }
    if (attributeName === "expires") {
      const expires = new Date(attributeValue);
      if (!Number.isNaN(expires.getTime())) options.expires = expires;
    }
    if (attributeName === "samesite") {
      const sameSite = attributeValue.toLowerCase();
      if (sameSite === "lax" || sameSite === "none" || sameSite === "strict") {
        options.sameSite = sameSite;
      }
    }
  }
  return { name, value: cookieValue, options };
}
