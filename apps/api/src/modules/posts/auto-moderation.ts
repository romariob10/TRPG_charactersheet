const BLOCKED_PHRASES = [
  /\b(?:kill|hang)\s+yourself\b/iu,
  /\bgo\s+(?:and\s+)?die\b/iu,
  /\b(?:n[i1!]gg(?:er|a)|f[a@]ggot)\b/iu,
  /(?:^|[^\p{L}])(?:убей|повесь)\s+себя(?:$|[^\p{L}])/iu,
  /(?:^|[^\p{L}])сдохни(?:$|[^\p{L}])/iu,
  /(?:^|[^\p{L}])(?:ниггер|пидорас)(?:$|[^\p{L}])/iu,
] as const;

const PROFANITY_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])х[\s._*~`|!-]*у[\s._*~`|!-]*[йеяиёю](?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:пизд(?:а|ец|ёж|юк|ят|ишь|ить)?|бля(?:дь|ть)|(?:е|ё)б(?:ать|ан|уч|ал|ло)?|долбо(?:е|ё)б)(?:$|[^\p{L}\p{N}])/iu,
  /\b(?:fuck|cunt|motherfucker)\b/iu,
] as const;

const TABLETOP_SIGNALS = [
  /\b(?:ttrpg|dnd|d&d|pathfinder|shadowrun|gurps|pbta|call of cthulhu|tabletop role[ -]?play(?:ing)?|game master|dungeon master|character sheet|one[ -]?shot|dice|initiative|saving throw|hit points?|npc)\b/iu,
  /(?:^|[^\p{L}])(?:нри|днд|д&д|настольн\p{L}*\s+ролев\p{L}*|ролев\p{L}*\s+игр\p{L}*|гейммастер\p{L}*|мастер\p{L}*\s+игр\p{L}*|ведущ\p{L}*|игрок\p{L}*|персонаж\p{L}*|кампани\p{L}*|сесси\p{L}*|ваншот\p{L}*|сеттинг\p{L}*|приключени\p{L}*|кубик\p{L}*|бросок\p{L}*|инициатив\p{L}*|спасброс\p{L}*|хитпоинт\p{L}*|нпс)(?:$|[^\p{L}])/iu,
] as const;

const CLEARLY_OFF_TOPIC_PATTERNS = [
  /\b(?:online casino|sports betting|forex signals?|crypto giveaway|binary options?|onlyfans promotion)\b/iu,
  /(?:^|[^\p{L}])(?:онлайн[ -]?казино|ставк\p{L}*\s+на\s+спорт|сигнал\p{L}*\s+(?:по\s+)?(?:крипт\p{L}*|форекс\p{L}*)|крипт\p{L}*\s+раздач\p{L}*|бинарн\p{L}*\s+опцион\p{L}*|быстр\p{L}*\s+заработ\p{L}*\s+без\s+вложен\p{L}*)(?:$|[^\p{L}])/iu,
] as const;

const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const MAX_LINKS = 4;

export type PostModerationReason =
  | "abuse"
  | "profanity"
  | "link_spam"
  | "off_topic";

export interface PostTopicAssessment {
  verdict: "related" | "unrelated" | "uncertain";
  confidence: number;
}

/* eslint-disable no-unused-vars -- Function type parameters document moderation contracts. */
export type PostTopicClassifier = (
  text: string,
) => Promise<PostTopicAssessment | null>;

export interface PostModerationOptions {
  hasGameEmbed?: boolean;
  classifyTopic?: PostTopicClassifier;
  onClassifierError?: (error: unknown) => void;
}
/* eslint-enable no-unused-vars */

export function moderatePostText(text: string): PostModerationReason | null {
  const normalized = normalizeForModeration(text);
  if (BLOCKED_PHRASES.some((pattern) => pattern.test(normalized))) {
    return "abuse";
  }

  if (PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "profanity";
  }

  const links = text.match(URL_PATTERN) ?? [];
  if (links.length > MAX_LINKS) return "link_spam";

  return null;
}

export async function moderatePostContent(
  text: string,
  options: PostModerationOptions = {},
): Promise<PostModerationReason | null> {
  const deterministicReason = moderatePostText(text);
  if (deterministicReason) return deterministicReason;

  const normalized = normalizeForModeration(text);
  if (
    options.hasGameEmbed ||
    TABLETOP_SIGNALS.some((pattern) => pattern.test(normalized))
  ) {
    return null;
  }

  if (CLEARLY_OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "off_topic";
  }

  if (!options.classifyTopic) return null;
  try {
    const assessment = await options.classifyTopic(text);
    return assessment?.verdict === "unrelated" && assessment.confidence >= 0.85
      ? "off_topic"
      : null;
  } catch (error) {
    options.onClassifierError?.(error);
    return null;
  }
}

function normalizeForModeration(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._*~`|]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
