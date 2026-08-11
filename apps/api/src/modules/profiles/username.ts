const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export function normalizeEmailToUsername(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const candidate = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  if (isValidUsername(candidate)) return candidate;
  return "";
}

export function fallbackUsername(userId: string): string {
  return `user-${userId.replaceAll("-", "").slice(0, 8)}`;
}

export function usernameForRegistration(email: string, userId: string): string {
  return normalizeEmailToUsername(email) || fallbackUsername(userId);
}
