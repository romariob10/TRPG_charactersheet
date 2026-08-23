import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Make characters.template_id nullable so characters can be created with either template_id or sheet_version_id
  await sql`ALTER TABLE characters ALTER COLUMN template_id DROP NOT NULL;`.execute(db);

  // 2. Make system_materials.template_id nullable so materials can belong directly to game_systems
  await sql`ALTER TABLE system_materials ALTER COLUMN template_id DROP NOT NULL;`.execute(db);

  // 3. Add game_system_id to posts with foreign key to game_systems
  await sql`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS game_system_id uuid REFERENCES game_systems(id) ON DELETE SET NULL;
  `.execute(db);

  await db.schema
    .createIndex("posts_game_system_idx")
    .ifNotExists()
    .on("posts")
    .column("game_system_id")
    .execute();

  // 4. Add immutable semantic fields snapshot to sheet_versions
  await sql`
    ALTER TABLE sheet_versions
    ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb;
  `.execute(db);

  // 5. Create character_sheet_field_values table for semantic character field storage
  await db.schema
    .createTable("character_sheet_field_values")
    .ifNotExists()
    .addColumn("character_id", "uuid", (col) =>
      col.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("field_key", "text", (col) => col.notNull())
    .addColumn("value", "jsonb")
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("updated_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_sheet_field_values_pk", [
      "character_id",
      "field_key",
    ])
    .execute();

  await db.schema
    .createIndex("char_sheet_field_values_char_idx")
    .ifNotExists()
    .on("character_sheet_field_values")
    .column("character_id")
    .execute();

  // 6. Safe backfill: associate existing system_materials and posts with canonical game_systems
  await sql`
    UPDATE system_materials sm
    SET system_id = gs.id
    FROM game_systems gs
    WHERE gs.legacy_template_id = sm.template_id AND sm.system_id IS NULL;
  `.execute(db);

  await sql`
    UPDATE posts p
    SET game_system_id = gs.id
    FROM game_systems gs
    WHERE gs.legacy_template_id = p.system_id AND p.game_system_id IS NULL;
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // 1. Check for null template_id in characters / system_materials before attempting to restore NOT NULL
  const nullCharacters = await sql<{ count: string }>`
    SELECT count(*)::text as count FROM characters WHERE template_id IS NULL
  `.execute(db);
  if (nullCharacters.rows[0]?.count !== "0") {
    throw new Error(
      `Cannot rollback migration: found ${nullCharacters.rows[0]?.count} character(s) without legacy template_id. Delete or migrate these characters first.`,
    );
  }

  const nullMaterials = await sql<{ count: string }>`
    SELECT count(*)::text as count FROM system_materials WHERE template_id IS NULL
  `.execute(db);
  if (nullMaterials.rows[0]?.count !== "0") {
    throw new Error(
      `Cannot rollback migration: found ${nullMaterials.rows[0]?.count} material(s) without legacy template_id. Delete or migrate these materials first.`,
    );
  }

  // 2. Restore NOT NULL constraints
  await sql`ALTER TABLE characters ALTER COLUMN template_id SET NOT NULL;`.execute(db);
  await sql`ALTER TABLE system_materials ALTER COLUMN template_id SET NOT NULL;`.execute(db);

  // 3. Drop character_sheet_field_values table and index
  await db.schema.dropIndex("char_sheet_field_values_char_idx").ifExists().execute();
  await db.schema.dropTable("character_sheet_field_values").ifExists().cascade().execute();

  // 4. Drop sheet_versions.fields
  await sql`ALTER TABLE sheet_versions DROP COLUMN IF EXISTS fields;`.execute(db);

  // 5. Drop posts.game_system_id
  await db.schema.dropIndex("posts_game_system_idx").ifExists().execute();
  await sql`ALTER TABLE posts DROP COLUMN IF EXISTS game_system_id;`.execute(db);
}
