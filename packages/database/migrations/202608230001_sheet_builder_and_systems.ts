import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Game Systems
  await db.schema
    .createTable("game_systems")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("owner_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("family", "text")
    .addColumn("edition", "text")
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("private"))
    .addColumn("legacy_template_id", "uuid", (col) =>
      col.references("pdf_templates.id").onDelete("set null"),
    )
    .addColumn("deleted_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("game_systems_slug_idx")
    .on("game_systems")
    .column("slug")
    .execute();

  await db.schema
    .createIndex("game_systems_owner_idx")
    .on("game_systems")
    .column("owner_id")
    .execute();

  // 2. Sheet Definitions
  await db.schema
    .createTable("sheet_definitions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("system_id", "uuid", (col) =>
      col.notNull().references("game_systems.id").onDelete("cascade"),
    )
    .addColumn("owner_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("character"))
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("current_version_id", "uuid")
    .addColumn("deleted_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("sheet_definitions_system_idx")
    .on("sheet_definitions")
    .column("system_id")
    .execute();

  // 3. Sheet Fields (stable semantic definitions)
  await db.schema
    .createTable("sheet_fields")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("sheet_definition_id", "uuid", (col) =>
      col.notNull().references("sheet_definitions.id").onDelete("cascade"),
    )
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("text"))
    .addColumn("default_value", "jsonb")
    .addColumn("options", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("min_value", "numeric")
    .addColumn("max_value", "numeric")
    .addColumn("read_only", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("sheet_fields_def_key_idx")
    .on("sheet_fields")
    .columns(["sheet_definition_id", "key"])
    .unique()
    .execute();

  // 4. Sheet Drafts
  await db.schema
    .createTable("sheet_drafts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("sheet_definition_id", "uuid", (col) =>
      col.notNull().unique().references("sheet_definitions.id").onDelete("cascade"),
    )
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("revision", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("layouts", "jsonb", (col) => col.notNull())
    .addColumn("fields", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("updated_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  // 5. Sheet Versions (immutable snapshots)
  await db.schema
    .createTable("sheet_versions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("sheet_definition_id", "uuid", (col) =>
      col.notNull().references("sheet_definitions.id").onDelete("cascade"),
    )
    .addColumn("version_number", "integer", (col) => col.notNull())
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("layouts", "jsonb", (col) => col.notNull())
    .addColumn("dependencies", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("changelog", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("published_by", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("sheet_versions_def_ver_idx")
    .on("sheet_versions")
    .columns(["sheet_definition_id", "version_number"])
    .unique()
    .execute();

  // 6. Component Definitions
  await db.schema
    .createTable("component_definitions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("author_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("system_id", "uuid", (col) =>
      col.references("game_systems.id").onDelete("set null"),
    )
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("scope", "text", (col) => col.notNull().defaultTo("personal"))
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`ARRAY[]::text[]`))
    .addColumn("thumbnail_url", "text")
    .addColumn("current_version_id", "uuid")
    .addColumn("usage_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("moderation_state", "text", (col) => col.notNull().defaultTo("approved"))
    .addColumn("deleted_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("component_definitions_author_idx")
    .on("component_definitions")
    .column("author_id")
    .execute();

  await db.schema
    .createIndex("component_definitions_scope_idx")
    .on("component_definitions")
    .column("scope")
    .execute();

  await db.schema
    .createIndex("component_definitions_system_idx")
    .on("component_definitions")
    .column("system_id")
    .execute();

  // 7. Component Drafts
  await db.schema
    .createTable("component_drafts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("component_id", "uuid", (col) =>
      col.notNull().unique().references("component_definitions.id").onDelete("cascade"),
    )
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("revision", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("layouts", "jsonb", (col) => col.notNull())
    .addColumn("exposed_properties", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("dependencies", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("updated_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  // 8. Component Versions (immutable)
  await db.schema
    .createTable("component_versions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("component_id", "uuid", (col) =>
      col.notNull().references("component_definitions.id").onDelete("cascade"),
    )
    .addColumn("version_number", "integer", (col) => col.notNull())
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("layouts", "jsonb", (col) => col.notNull())
    .addColumn("exposed_properties", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("dependencies", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("changelog", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("author_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("component_versions_comp_ver_idx")
    .on("component_versions")
    .columns(["component_id", "version_number"])
    .unique()
    .execute();

  // 9. Component Dependencies (for fast graph cycle/resolution queries)
  await db.schema
    .createTable("component_dependencies")
    .addColumn("parent_version_id", "uuid", (col) =>
      col.notNull().references("component_versions.id").onDelete("cascade"),
    )
    .addColumn("child_version_id", "uuid", (col) =>
      col.notNull().references("component_versions.id").onDelete("restrict"),
    )
    .addPrimaryKeyConstraint("component_dependencies_pk", [
      "parent_version_id",
      "child_version_id",
    ])
    .execute();

  // 10. Character Repeater Rows
  await db.schema
    .createTable("character_repeater_rows")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("character_id", "uuid", (col) =>
      col.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("repeater_key", "text", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("character_repeater_rows_char_key_pos_idx")
    .on("character_repeater_rows")
    .columns(["character_id", "repeater_key", "position"])
    .execute();

  // 11. Character Repeater Values
  await db.schema
    .createTable("character_repeater_values")
    .addColumn("row_id", "uuid", (col) =>
      col.notNull().references("character_repeater_rows.id").onDelete("cascade"),
    )
    .addColumn("slot_id", "text", (col) => col.notNull())
    .addColumn("value", "jsonb")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_repeater_values_pk", ["row_id", "slot_id"])
    .execute();

  // 12. Character Repeater Mutations (Idempotency and audit)
  await db.schema
    .createTable("character_repeater_mutations")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("character_id", "uuid", (col) =>
      col.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("client_mutation_id", "uuid", (col) => col.notNull())
    .addColumn("repeater_key", "text", (col) => col.notNull())
    .addColumn("row_id", "uuid")
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("payload", "jsonb")
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("character_repeater_mutations_uniq_idx")
    .on("character_repeater_mutations")
    .columns(["character_id", "client_mutation_id"])
    .unique()
    .execute();

  // 13. Additive columns for existing tables
  await db.schema
    .alterTable("characters")
    .addColumn("sheet_version_id", "uuid", (col) =>
      col.references("sheet_versions.id").onDelete("set null"),
    )
    .addColumn("system_id", "uuid", (col) =>
      col.references("game_systems.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .alterTable("system_materials")
    .addColumn("system_id", "uuid", (col) =>
      col.references("game_systems.id").onDelete("cascade"),
    )
    .execute();

  // 14. Safe Backfill: create game_systems for existing pdf_templates and link characters/materials
  await sql`
    INSERT INTO game_systems (id, owner_id, title, slug, description, visibility, legacy_template_id, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      owner_id,
      title,
      slug,
      COALESCE(game_system, ''),
      CASE WHEN is_public THEN 'public' ELSE 'private' END,
      id,
      created_at,
      updated_at
    FROM pdf_templates
    ON CONFLICT DO NOTHING;
  `.execute(db);

  await sql`
    UPDATE characters c
    SET system_id = gs.id
    FROM game_systems gs
    WHERE gs.legacy_template_id = c.template_id AND c.system_id IS NULL;
  `.execute(db);

  await sql`
    UPDATE system_materials sm
    SET system_id = gs.id
    FROM game_systems gs
    WHERE gs.legacy_template_id = sm.template_id AND sm.system_id IS NULL;
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("system_materials").dropColumn("system_id").execute();
  await db.schema.alterTable("characters").dropColumn("system_id").execute();
  await db.schema.alterTable("characters").dropColumn("sheet_version_id").execute();

  await db.schema.dropTable("character_repeater_mutations").ifExists().execute();
  await db.schema.dropTable("character_repeater_values").ifExists().execute();
  await db.schema.dropTable("character_repeater_rows").ifExists().execute();

  await db.schema.dropTable("component_dependencies").ifExists().execute();
  await db.schema.dropTable("component_versions").ifExists().execute();
  await db.schema.dropTable("component_drafts").ifExists().execute();
  await db.schema.dropTable("component_definitions").ifExists().execute();

  await db.schema.dropTable("sheet_versions").ifExists().execute();
  await db.schema.dropTable("sheet_drafts").ifExists().execute();
  await db.schema.dropTable("sheet_fields").ifExists().execute();
  await db.schema.dropTable("sheet_definitions").ifExists().execute();
  await db.schema.dropTable("game_systems").ifExists().execute();
}
