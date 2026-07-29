import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createType("template_visibility").asEnum(["private", "curated"]).execute();
  await db.schema.createType("catalog_status").asEnum(["pending", "processing", "ready", "partial", "failed"]).execute();
  await db.schema.createType("character_status").asEnum(["active", "trashed"]).execute();
  await db.schema.createType("character_role").asEnum(["owner", "editor"]).execute();
  await db.schema.createType("field_kind").asEnum(["text", "multiline", "checkbox", "radio", "dropdown", "list", "button", "signature", "unknown"]).execute();
  await db.schema.createType("catalog_source").asEnum(["pdf", "heuristic", "ocr", "vision", "manual"]).execute();
  await db.schema.createType("proposal_status").asEnum(["pending", "applied", "rejected", "expired"]).execute();

  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("users_status_check", sql`status in ('active', 'disabled')`)
    .addCheckConstraint("users_email_normalized_check", sql`email = lower(btrim(email))`)
    .execute();

  await db.schema
    .createTable("profiles")
    .addColumn("id", "uuid", (col) => col.primaryKey().references("users.id").onDelete("cascade"))
    .addColumn("display_name", "text")
    .addColumn("locale", "text", (col) => col.notNull().defaultTo("ru"))
    .addColumn("is_admin", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("profiles_locale_check", sql`locale in ('ru', 'en')`)
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("last_used_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createTable("auth_tokens")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("auth_tokens_kind_check", sql`kind in ('email_verification', 'password_reset', 'email_change')`)
    .execute();

  await db.schema
    .createTable("object_files")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("storage_key", "text", (col) => col.notNull().unique())
    .addColumn("sha256", "text", (col) => col.notNull())
    .addColumn("size_bytes", "bigint", (col) => col.notNull())
    .addColumn("media_type", "text", (col) => col.notNull())
    .addColumn("state", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("pdf_templates")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("file_id", "uuid", (col) => col.notNull().references("object_files.id"))
    .addColumn("owner_id", "uuid", (col) => col.references("users.id").onDelete("cascade"))
    .addColumn("visibility", sql`template_visibility`, (col) => col.notNull().defaultTo("private"))
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("game_system", "text")
    .addColumn("storage_path", "text", (col) => col.notNull().unique())
    .addColumn("sha256", "text", (col) => col.notNull())
    .addColumn("page_count", "integer", (col) => col.notNull())
    .addColumn("catalog_status", sql`catalog_status`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("allow_vision", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("catalog_error", "text")
    .addColumn("catalog_approved_at", "timestamptz")
    .addColumn("catalog_approved_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("is_public", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("deleted_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("pdf_templates_title_length_check", sql`char_length(title) between 1 and 160`)
    .addCheckConstraint("pdf_templates_page_count_check", sql`page_count between 1 and 20`)
    .addCheckConstraint("pdf_templates_visibility_owner_check", sql`(visibility = 'curated' and owner_id is null) or (visibility = 'private' and owner_id is not null)`)
    .execute();

  await db.schema
    .createTable("pdf_fields")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) => col.notNull().references("pdf_templates.id").onDelete("cascade"))
    .addColumn("pdf_name", "text", (col) => col.notNull())
    .addColumn("kind", sql`field_kind`, (col) => col.notNull())
    .addColumn("default_value", "jsonb")
    .addColumn("options", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("auto_label", "text")
    .addColumn("auto_aliases", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn("auto_section", "text")
    .addColumn("page", "integer", (col) => col.notNull())
    .addColumn("auto_group_id", "uuid")
    .addColumn("auto_group_order", "integer")
    .addColumn("confidence", "real", (col) => col.notNull().defaultTo(0))
    .addColumn("source", sql`catalog_source`, (col) => col.notNull().defaultTo("pdf"))
    .addColumn("is_enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addUniqueConstraint("pdf_fields_template_pdf_name_key", ["template_id", "pdf_name"])
    .addCheckConstraint("pdf_fields_options_array_check", sql`jsonb_typeof(options) = 'array'`)
    .addCheckConstraint("pdf_fields_page_check", sql`page between 1 and 20`)
    .addCheckConstraint("pdf_fields_confidence_check", sql`confidence between 0 and 1`)
    .execute();

  await db.schema
    .createTable("pdf_field_widgets")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("field_id", "uuid", (col) => col.notNull().references("pdf_fields.id").onDelete("cascade"))
    .addColumn("page", "integer", (col) => col.notNull())
    .addColumn("rect", sql`real[]`, (col) => col.notNull())
    .addColumn("pdf_rect", sql`real[]`, (col) => col.notNull())
    .addColumn("rotation", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("export_value", "text")
    .addColumn("widget_index", "integer", (col) => col.notNull().defaultTo(0))
    .addUniqueConstraint("pdf_field_widgets_field_widget_index_key", ["field_id", "widget_index"])
    .addCheckConstraint("pdf_field_widgets_page_check", sql`page between 1 and 20`)
    .addCheckConstraint("pdf_field_widgets_rect_length_check", sql`array_length(rect, 1) = 4`)
    .addCheckConstraint("pdf_field_widgets_pdf_rect_length_check", sql`array_length(pdf_rect, 1) = 4`)
    .execute();

  await db.schema
    .createTable("template_subscriptions")
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("template_id", "uuid", (col) => col.notNull().references("pdf_templates.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("template_subscriptions_pkey", ["user_id", "template_id"])
    .execute();

  await db.schema
    .createTable("characters")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) => col.notNull().references("pdf_templates.id"))
    .addColumn("owner_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("status", sql`character_status`, (col) => col.notNull().defaultTo("active"))
    .addColumn("revision", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("deleted_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("characters_name_length_check", sql`char_length(name) between 1 and 120`)
    .execute();

  await db.schema
    .createTable("character_members")
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("role", sql`character_role`, (col) => col.notNull().defaultTo("editor"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_members_pkey", ["character_id", "user_id"])
    .addCheckConstraint("character_members_role_check", sql`role = 'editor'`)
    .execute();

  await db.schema
    .createTable("character_values")
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("field_id", "uuid", (col) => col.notNull().references("pdf_fields.id").onDelete("cascade"))
    .addColumn("value", "jsonb")
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_by", "uuid", (col) => col.references("users.id"))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_values_pkey", ["character_id", "field_id"])
    .execute();

  await db.schema
    .createTable("character_mutations")
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("client_mutation_id", "uuid", (col) => col.notNull())
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("field_id", "uuid", (col) => col.notNull().references("pdf_fields.id").onDelete("cascade"))
    .addColumn("value", "jsonb")
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("revision", "bigint", (col) => col.notNull())
    .addColumn("overwritten_remote", "boolean", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_mutations_pkey", ["character_id", "client_mutation_id"])
    .execute();

  await db.schema
    .createTable("character_invites")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("created_by", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("accepted_by", "uuid", (col) => col.references("users.id"))
    .addColumn("accepted_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createTable("catalog_jobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) => col.notNull().references("pdf_templates.id").onDelete("cascade"))
    .addColumn("status", sql`catalog_status`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("current_step", "text", (col) => col.notNull().defaultTo("queued"))
    .addColumn("progress", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("error", "text")
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("catalog_jobs_progress_check", sql`progress between 0 and 100`)
    .execute();

  await db.schema
    .createTable("ai_threads")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("copilot_thread_id", "text", (col) => col.notNull().unique())
    .addColumn("title", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createTable("ai_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("thread_id", "uuid", (col) => col.notNull().references("ai_threads.id").onDelete("cascade"))
    .addColumn("message_id", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content", "jsonb", (col) => col.notNull())
    .addColumn("sequence_index", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addUniqueConstraint("ai_messages_thread_message_key", ["thread_id", "message_id"])
    .execute();

  await db.schema
    .createTable("ai_proposals")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("character_id", "uuid", (col) => col.notNull().references("characters.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("status", sql`proposal_status`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createTable("ai_proposal_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("proposal_id", "uuid", (col) => col.notNull().references("ai_proposals.id").onDelete("cascade"))
    .addColumn("field_id", "uuid", (col) => col.notNull().references("pdf_fields.id"))
    .addColumn("old_value", "jsonb")
    .addColumn("new_value", "jsonb")
    .addColumn("expected_version", "integer", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("confidence", "real", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addCheckConstraint("ai_proposal_items_confidence_check", sql`confidence between 0 and 1`)
    .execute();

  await sql`
    create or replace view effective_pdf_fields
    with (security_invoker = true) as
    select
      field.id,
      field.template_id,
      field.pdf_name,
      field.kind,
      field.default_value,
      field.options,
      coalesce(nullif(btrim(field.auto_label), ''), field.pdf_name) as label,
      field.auto_aliases as aliases,
      nullif(btrim(field.auto_section), '') as section,
      field.page,
      field.auto_group_id as group_id,
      field.auto_group_order as group_order,
      field.confidence,
      field.source,
      field.updated_at,
      field.is_enabled
    from pdf_fields as field
  `.execute(db);

  await sql`
    create function set_updated_at()
    returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$
  `.execute(db);
  for (const table of ["users", "profiles", "pdf_templates", "pdf_fields", "characters", "catalog_jobs", "ai_threads", "ai_proposals"]) {
    await sql.raw(`create trigger ${table}_updated_at before update on ${table} for each row execute function set_updated_at()`).execute(db);
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`drop view if exists effective_pdf_fields`.execute(db);
  for (const table of ["ai_proposal_items", "ai_proposals", "ai_messages", "ai_threads", "catalog_jobs", "character_invites", "character_mutations", "character_values", "character_members", "characters", "template_subscriptions", "pdf_field_widgets", "pdf_fields", "pdf_templates", "object_files", "auth_tokens", "sessions", "profiles", "users"]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
  await sql`drop function if exists set_updated_at()`.execute(db);
  for (const type of ["proposal_status", "catalog_source", "field_kind", "character_role", "character_status", "catalog_status", "template_visibility"]) {
    await db.schema.dropType(type).ifExists().execute();
  }
}
