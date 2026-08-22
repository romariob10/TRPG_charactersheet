export type FieldValue = string | number | boolean | string[] | null;

export type FieldKind =
  | "text"
  | "multiline"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "list"
  | "button"
  | "signature"
  | "unknown";

export type CatalogSource = "pdf" | "heuristic" | "ocr" | "vision" | "manual";

export type CatalogStatus =
  "pending" | "processing" | "ready" | "partial" | "failed";

export interface FieldWidget {
  id: string;
  page: number;
  rect: [number, number, number, number];
  pdfRect: [number, number, number, number];
  rotation: number;
  exportValue?: string | null;
}

export interface FieldDescriptor {
  id: string;
  pdfName: string;
  kind: FieldKind;
  label: string;
  aliases: string[];
  section: string | null;
  page: number;
  options: string[];
  groupId: string | null;
  groupOrder: number | null;
  confidence: number;
  source: CatalogSource;
  widgets: FieldWidget[];
}

export interface CharacterField extends FieldDescriptor {
  value: FieldValue;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface TemplateField extends FieldDescriptor {
  enabled: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  slug?: string;
  isPublic?: boolean;
  publishedAt?: string | null;
  author?: PublicAuthor;
  gameSystem?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
  role: "owner" | "editor";
  revision: number;
  status: "active" | "trashed";
  catalogStatus: CatalogStatus;
  pageCount: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PublicAuthor {
  id: string;
  username: string;
  displayName: string | null;
}

export interface TemplateSummary {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  catalogStatus: CatalogStatus;
  approvedAt: string | null;
  updatedAt: string;
  isPublic: boolean;
  subscribed?: boolean;
  deletedAt?: string | null;
  slug?: string;
  author?: PublicAuthor;
  likeCount?: number;
  commentCount?: number;
  likedByMe?: boolean;
}

export interface TemplateComment {
  id: string;
  templateId: string;
  author: PublicAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string;
  joinedAt: string;
  publicTemplateCount: number;
  publicCharacterCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  totalLikes: number;
  allowComments?: boolean;
  showCharacters?: boolean;
  showTemplates?: boolean;
  showActivity?: boolean;
}

export interface PublicCharacterSummary {
  id: string;
  name: string;
  slug: string;
  gameSystem: string | null;
  pageCount: number;
  updatedAt: string;
  publishedAt: string;
  author: PublicAuthor;
  likeCount: number;
  likedByMe: boolean;
}

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

export type SiteRole = "admin" | "moderator" | "user";

export interface MyProfile {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  bio: string;
  isAdmin: boolean;
  siteRole: SiteRole;
  allowComments?: boolean;
  showCharacters?: boolean;
  showTemplates?: boolean;
  showActivity?: boolean;
}

export interface TemplateEditorData extends TemplateSummary {
  fields: TemplateField[];
  pdfUrl: string;
}

export interface CharacterEditorData {
  id: string;
  name: string;
  role: "owner" | "editor";
  revision: number;
  templateId: string;
  catalogStatus: CharacterSummary["catalogStatus"];
  fields: CharacterField[];
  pdfUrl: string;
  currentUserId: string;
}

export interface FieldMutationResponse {
  value: FieldValue;
  version: number;
  revision: number;
  overwrittenRemote: boolean;
  updatedAt: string;
  updatedBy: string;
}
