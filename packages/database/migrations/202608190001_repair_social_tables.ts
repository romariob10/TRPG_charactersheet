import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

// Databases migrated before the dist-migration test received its own migration
// ledger recorded 202608180004..202608180013 as applied while their `create
// table` statements landed in a temporary schema that was dropped afterwards.
// The `alter table` statements of those migrations did reach the target schema,
// so the ledger cannot simply be rewound. This migration re-creates only the
// missing tables and indexes and is a no-op on a consistent database.
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("post_bookmarks")
    .ifNotExists()
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addPrimaryKeyConstraint("post_bookmarks_pkey", ["user_id", "post_id"])
    .execute();

  await db.schema
    .createTable("post_views")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("viewer_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade"),
    )
    .addColumn("viewer_hash", "text")
    .addColumn("viewed_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("post_views_post_viewer_idx")
    .ifNotExists()
    .on("post_views")
    .columns(["post_id", "viewer_id"])
    .execute();

  await db.schema
    .createIndex("post_views_post_hash_idx")
    .ifNotExists()
    .on("post_views")
    .columns(["post_id", "viewer_hash"])
    .execute();

  await db.schema
    .createTable("admin_audit_events")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("actor_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("actor_role", "text", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("target_type", "text", (col) => col.notNull())
    .addColumn("target_id", "text")
    .addColumn("reason", "text")
    .addColumn("metadata", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("request_id", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("admin_audit_created_at_idx")
    .ifNotExists()
    .on("admin_audit_events")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("admin_audit_target_idx")
    .ifNotExists()
    .on("admin_audit_events")
    .columns(["target_type", "target_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("admin_audit_actor_idx")
    .ifNotExists()
    .on("admin_audit_events")
    .columns(["actor_id", "created_at"])
    .execute();

  await db.schema
    .createTable("content_reports")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("reporter_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("target_type", "text", (col) => col.notNull())
    .addColumn("target_id", "text", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("details", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("moderator_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("resolution_note", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("resolved_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("content_reports_status_created_idx")
    .ifNotExists()
    .on("content_reports")
    .columns(["status", "created_at"])
    .execute();

  await db.schema
    .createIndex("content_reports_target_idx")
    .ifNotExists()
    .on("content_reports")
    .columns(["target_type", "target_id"])
    .execute();

  await db.schema
    .createIndex("content_reports_reporter_idx")
    .ifNotExists()
    .on("content_reports")
    .columns(["reporter_id", "created_at"])
    .execute();

  await db.schema
    .createTable("user_restrictions")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("moderator_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("revoked_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("revocation_reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("user_restrictions_active_idx")
    .ifNotExists()
    .on("user_restrictions")
    .columns(["user_id", "action", "expires_at", "revoked_at"])
    .execute();

  await db.schema
    .createIndex("user_restrictions_created_idx")
    .ifNotExists()
    .on("user_restrictions")
    .column("created_at")
    .execute();

  await db.schema
    .createTable("user_notifications")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("actor_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("target_type", "text")
    .addColumn("target_id", "text")
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text")
    .addColumn("metadata", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("read_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("user_notifications_user_unread_idx")
    .ifNotExists()
    .on("user_notifications")
    .columns(["user_id", "read_at", "created_at"])
    .execute();

  await db.schema
    .createTable("direct_conversations")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("participant_one_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("participant_two_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("last_message_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addUniqueConstraint("direct_conversations_participants_unique", [
      "participant_one_id",
      "participant_two_id",
    ])
    .execute();

  await db.schema
    .createTable("direct_messages")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("conversation_id", "uuid", (col) =>
      col.notNull().references("direct_conversations.id").onDelete("cascade"),
    )
    .addColumn("sender_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("read_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("direct_messages_conversation_idx")
    .ifNotExists()
    .on("direct_messages")
    .columns(["conversation_id", "created_at"])
    .execute();

  await db.schema
    .createTable("template_reviews")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) =>
      col.notNull().references("pdf_templates.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("rating", "smallint", (col) => col.notNull())
    .addColumn("title", "text")
    .addColumn("body", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addUniqueConstraint("template_reviews_template_user_unique", [
      "template_id",
      "user_id",
    ])
    .execute();

  await db.schema
    .createIndex("template_reviews_template_idx")
    .ifNotExists()
    .on("template_reviews")
    .columns(["template_id", "created_at"])
    .execute();
}

// The tables this migration repairs are owned by 202608180004..202608180013.
// Dropping them here would corrupt a database whose ledger still lists those
// migrations, so rolling back is intentionally a no-op.
export async function down(): Promise<void> {}
