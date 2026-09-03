const BLOCKED_PHRASES = [
  /\b(?:kill|hang)\s+yourself\b/iu,
  /\bgo\s+(?:and\s+)?die\b/iu,
  /\b(?:n[i1!]gg(?:er|a)|f[a@]ggot)\b/iu,
  /(?:^|[^\p{L}])(?:убей|повесь)\s+себя(?:$|[^\p{L}])/iu,
  /(?:^|[^\p{L}])сдохни(?:$|[^\p{L}])/iu,
  /(?:^|[^\p{L}])(?:ниггер|пидорас)(?:$|[^\p{L}])/iu,
] as const;

const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const MAX_LINKS = 4;

export type PostModerationReason = "abuse" | "link_spam";

export function moderatePostText(text: string): PostModerationReason | null {
  const normalized = normalizeForModeration(text);
  if (BLOCKED_PHRASES.some((pattern) => pattern.test(normalized))) {
    return "abuse";
  }

  const links = text.match(URL_PATTERN) ?? [];
  if (links.length > MAX_LINKS) return "link_spam";

  return null;
}

function normalizeForModeration(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._*~`|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
