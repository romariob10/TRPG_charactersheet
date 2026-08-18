import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;
export type Json = ColumnType<unknown, unknown, unknown>;
export type Uuid = Generated<string>;

export type UserStatus = "active" | "disabled" | "suspended" | "banned";
export type AuthTokenKind =
  "email_verification" | "password_reset" | "email_change";
export type TemplateVisibility = "private" | "curated";
export type CatalogStatus =
  "pending" | "processing" | "ready" | "partial" | "failed";
export type CharacterStatus = "active" | "trashed";
export type CharacterRole = "owner" | "editor";
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
export type ProposalStatus = "pending" | "applied" | "rejected" | "expired";
export type PostReaction = "like" | "joy" | "moai" | "fire" | "mindblown" | "dice";

export interface UsersTable {
  id: Uuid;
  email: string;
  password_hash: string;
  status: UserStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProfilesTable {
  id: string;
  display_name: string | null;
  username: string;
  bio: string;
  locale: "ru" | "en";
  is_admin: boolean;
  site_role: "admin" | "moderator" | "user";
  allow_comments: Generated<boolean>;
  show_characters: Generated<boolean>;
  show_templates: Generated<boolean>;
  show_activity: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionsTable {
  id: Uuid;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
  last_used_at: Timestamp;
}

export interface AuthTokensTable {
  id: Uuid;
  user_id: string;
  token_hash: string;
  kind: AuthTokenKind;
  payload: Json;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface ObjectFilesTable {
  id: Uuid;
  storage_key: string;
  sha256: string;
  size_bytes: string;
  media_type: string;
  state: string;
  created_at: Timestamp;
}

export interface PdfTemplatesTable {
  id: Uuid;
  file_id: string;
  owner_id: string | null;
  visibility: TemplateVisibility;
  title: string;
  slug: string;
  game_system: string | null;
  storage_path: string;
  sha256: string;
  page_count: number;
  catalog_status: CatalogStatus;
  allow_vision: boolean;
  catalog_error: string | null;
  catalog_approved_at: Timestamp | null;
  catalog_approved_by: string | null;
  is_public: boolean;
  tags: Generated<string[]>;
  genre: string | null;
  complexity: string | null;
  rating_average: Generated<number>;
  rating_count: Generated<number>;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PdfFieldsTable {
  id: Uuid;
  template_id: string;
  pdf_name: string;
  kind: FieldKind;
  default_value: Json | null;
  options: Json;
  auto_label: string | null;
  auto_aliases: string[];
  auto_section: string | null;
  page: number;
  auto_group_id: string | null;
  auto_group_order: number | null;
  confidence: number;
  source: CatalogSource;
  is_enabled: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PdfFieldWidgetsTable {
  id: Uuid;
  field_id: string;
  page: number;
  rect: number[];
  pdf_rect: number[];
  rotation: number;
  export_value: string | null;
  widget_index: number;
}

export interface TemplateSubscriptionsTable {
  user_id: string;
  template_id: string;
  created_at: Timestamp;
}

export interface TemplateLikesTable {
  user_id: string;
  template_id: string;
  created_at: Timestamp;
}

export interface TemplateCommentsTable {
  id: Uuid;
  template_id: string;
  author_id: string;
  body: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CharactersTable {
  id: Uuid;
  template_id: string;
  owner_id: string;
  name: string;
  slug: Generated<string>;
  is_public: Generated<boolean>;
  published_at: ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null
  >;
  remix_source_id: Generated<string | null>;
  status: CharacterStatus;
  revision: string;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CharacterLikesTable {
  user_id: string;
  character_id: string;
  created_at: Timestamp;
}

export interface ProfileFollowsTable {
  follower_id: string;
  following_id: string;
  created_at: Timestamp;
}

export interface CharacterMembersTable {
  character_id: string;
  user_id: string;
  role: CharacterRole;
  created_at: Timestamp;
}

export interface CharacterValuesTable {
  character_id: string;
  field_id: string;
  value: Json | null;
  version: number;
  updated_by: string | null;
  updated_at: Timestamp;
}

export interface CharacterMutationsTable {
  character_id: string;
  client_mutation_id: string;
  user_id: string;
  field_id: string;
  value: Json | null;
  version: number;
  revision: string;
  overwritten_remote: boolean;
  created_at: Timestamp;
}

export interface CharacterInvitesTable {
  id: Uuid;
  character_id: string;
  token_hash: string;
  created_by: string;
  expires_at: Timestamp;
  accepted_by: string | null;
  accepted_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export interface CatalogJobsTable {
  id: Uuid;
  template_id: string;
  status: CatalogStatus;
  current_step: string;
  progress: number;
  error: string | null;
  attempts: number;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AiThreadsTable {
  id: Uuid;
  character_id: string;
  user_id: string;
  copilot_thread_id: string;
  title: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AiMessagesTable {
  id: Uuid;
  thread_id: string;
  message_id: string;
  role: string;
  content: Json;
  sequence_index: number;
  created_at: Timestamp;
}

export interface AiProposalsTable {
  id: Uuid;
  character_id: string;
  user_id: string;
  status: ProposalStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AiProposalItemsTable {
  id: Uuid;
  proposal_id: string;
  field_id: string;
  old_value: Json | null;
  new_value: Json | null;
  expected_version: number;
  reason: string;
  confidence: number;
  created_at: Timestamp;
}

export interface PostsTable {
  id: Uuid;
  author_id: string;
  slug: string;
  title: string | null;
  content: Json;
  plain_text: string;
  views_count: number;
  is_hidden: Generated<boolean>;
  published_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface PostImagesTable {
  file_id: string;
  uploader_id: string;
  post_id: string | null;
  width: number | null;
  height: number | null;
  created_at: Timestamp;
}

export interface PostReactionsTable {
  user_id: string;
  post_id: string;
  reaction: PostReaction;
  created_at: Timestamp;
}

export interface PostCommentsTable {
  id: Uuid;
  post_id: string;
  author_id: string;
  body: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface PostBookmarksTable {
  user_id: string;
  post_id: string;
  created_at: Timestamp;
}

export interface PostViewsTable {
  id: Generated<Uuid>;
  post_id: string;
  viewer_id: string | null;
  viewer_hash: string | null;
  viewed_at: Timestamp;
}

export interface AdminAuditEventsTable {
  id: Generated<Uuid>;
  actor_id: string | null;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: unknown;
  request_id: string | null;
  created_at: Timestamp;
}

export interface ContentReportsTable {
  id: Generated<Uuid>;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: Generated<string>;
  moderator_id: string | null;
  resolution_note: string | null;
  created_at: Timestamp;
  resolved_at: Timestamp | null;
}

export interface UserRestrictionsTable {
  id: Generated<Uuid>;
  user_id: string;
  moderator_id: string | null;
  action: string;
  reason: string;
  expires_at: Timestamp | null;
  revoked_at: Timestamp | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  created_at: Timestamp;
}

export interface UserNotificationsTable {
  id: Generated<Uuid>;
  user_id: string;
  actor_id: string | null;
  type: string;
  target_type: string | null;
  target_id: string | null;
  title: string;
  body: string | null;
  metadata: Generated<Json>;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

export interface DirectConversationsTable {
  id: Generated<Uuid>;
  participant_one_id: string;
  participant_two_id: string;
  last_message_at: Timestamp;
  created_at: Timestamp;
}

export interface DirectMessagesTable {
  id: Generated<Uuid>;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

export interface TemplateReviewsTable {
  id: Generated<Uuid>;
  template_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Database {
  users: UsersTable;
  profiles: ProfilesTable;
  sessions: SessionsTable;
  auth_tokens: AuthTokensTable;
  object_files: ObjectFilesTable;
  pdf_templates: PdfTemplatesTable;
  pdf_fields: PdfFieldsTable;
  pdf_field_widgets: PdfFieldWidgetsTable;
  template_subscriptions: TemplateSubscriptionsTable;
  template_likes: TemplateLikesTable;
  template_comments: TemplateCommentsTable;
  characters: CharactersTable;
  character_likes: CharacterLikesTable;
  profile_follows: ProfileFollowsTable;
  character_members: CharacterMembersTable;
  character_values: CharacterValuesTable;
  character_mutations: CharacterMutationsTable;
  character_invites: CharacterInvitesTable;
  catalog_jobs: CatalogJobsTable;
  ai_threads: AiThreadsTable;
  ai_messages: AiMessagesTable;
  ai_proposals: AiProposalsTable;
  ai_proposal_items: AiProposalItemsTable;
  posts: PostsTable;
  post_images: PostImagesTable;
  post_reactions: PostReactionsTable;
  post_comments: PostCommentsTable;
  post_bookmarks: PostBookmarksTable;
  post_views: PostViewsTable;
  admin_audit_events: AdminAuditEventsTable;
  content_reports: ContentReportsTable;
  user_restrictions: UserRestrictionsTable;
  user_notifications: UserNotificationsTable;
  direct_conversations: DirectConversationsTable;
  direct_messages: DirectMessagesTable;
  template_reviews: TemplateReviewsTable;
}
