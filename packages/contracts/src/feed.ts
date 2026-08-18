import type { PublicAuthor } from "./profiles.js";

export interface SocialFeedItem {
  kind: "system" | "character";
  id: string;
  slug: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  publishedAt: string;
  author: PublicAuthor;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  remixedByMe: boolean;
}
