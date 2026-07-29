import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const indexes = [
  `create unique index pdf_templates_private_hash_idx on pdf_templates(owner_id, sha256) where visibility = 'private'`,
  `create index pdf_fields_search_idx on pdf_fields using gin ((coalesce(auto_label, '') || ' ' || pdf_name || ' ' || coalesce(auto_section, '')) gin_trgm_ops)`,
  `create index characters_owner_idx on characters(owner_id, status, updated_at desc)`,
  `create index character_values_updated_idx on character_values(character_id, updated_at desc)`,
  `create index ai_messages_thread_sequence_idx on ai_messages(thread_id, sequence_index)`,
  `create index ai_threads_character_user_updated_idx on ai_threads(character_id, user_id, updated_at desc)`,
  `create index pdf_templates_owner_approval_idx on pdf_templates(owner_id, catalog_approved_at, updated_at desc)`,
  `create index pdf_templates_catalog_approved_by_idx on pdf_templates(catalog_approved_by) where catalog_approved_by is not null`,
  `create index template_subscriptions_template_idx on template_subscriptions(template_id, created_at desc)`,
  `create index pdf_templates_community_idx on pdf_templates(catalog_approved_at desc, updated_at desc) where is_public = true and visibility = 'private'`,
  `create index pdf_templates_community_hash_idx on pdf_templates(sha256) where is_public = true and visibility = 'private'`,
  `create index pdf_templates_active_owner_idx on pdf_templates(owner_id, updated_at desc) where deleted_at is null`,
  `create index pdf_templates_active_community_idx on pdf_templates(catalog_approved_at desc, updated_at desc) where deleted_at is null and is_public = true and visibility = 'private'`,
];

const indexNames = [
  "pdf_templates_private_hash_idx",
  "pdf_fields_search_idx",
  "characters_owner_idx",
  "character_values_updated_idx",
  "ai_messages_thread_sequence_idx",
  "ai_threads_character_user_updated_idx",
  "pdf_templates_owner_approval_idx",
  "pdf_templates_catalog_approved_by_idx",
  "template_subscriptions_template_idx",
  "pdf_templates_community_idx",
  "pdf_templates_community_hash_idx",
  "pdf_templates_active_owner_idx",
  "pdf_templates_active_community_idx",
];

export async function up(db: Kysely<Database>): Promise<void> {
  for (const index of indexes) {
    await sql.raw(index).execute(db);
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const name of [...indexNames].reverse()) {
    await sql`drop index if exists ${sql.id(name)}`.execute(db);
  }
}
