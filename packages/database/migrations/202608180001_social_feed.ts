import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("characters")
    .addColumn("slug", "text")
    .addColumn("is_public", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("published_at", "timestamptz")
    .addColumn("remix_source_id", "uuid", (col) =>
      col.references("characters.id").onDelete("set null"),
    )
    .execute();

  await sql`
    update characters
    set slug = 'sheet-' || left(replace(id::text, '-', ''), 8)
    where slug is null
  `.execute(db);
  await sql`alter table characters alter column slug set not null`.execute(db);
  await sql`
    alter table characters
    alter column slug set default ('sheet-' || left(replace(gen_random_uuid()::text, '-', ''), 8))
  `.execute(db);
  await sql`
    alter table characters
    add constraint characters_owner_slug_key unique (owner_id, slug)
  `.execute(db);
  await sql`
    alter table characters
    add constraint characters_slug_format_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 80)
  `.execute(db);
  await sql`
    create index characters_public_feed_idx
    on characters(published_at desc, id desc)
    where is_public = true and status = 'active'
  `.execute(db);

  await db.schema
    .createTable("character_likes")
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("character_id", "uuid", (col) =>
      col.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("character_likes_pkey", ["user_id", "character_id"])
    .execute();
  await sql`
    create index character_likes_character_idx
    on character_likes(character_id, created_at desc)
  `.execute(db);

  await db.schema
    .createTable("profile_follows")
    .addColumn("follower_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("following_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("profile_follows_pkey", ["follower_id", "following_id"])
    .addCheckConstraint("profile_follows_no_self_check", sql`follower_id <> following_id`)
    .execute();
  await sql`
    create index profile_follows_following_idx
    on profile_follows(following_id, created_at desc)
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("profile_follows").ifExists().execute();
  await db.schema.dropTable("character_likes").ifExists().execute();
  await db.schema.alterTable("characters").dropColumn("published_at").execute();
  await db.schema.alterTable("characters").dropColumn("is_public").execute();
  await db.schema.alterTable("characters").dropColumn("remix_source_id").execute();
  await db.schema.alterTable("characters").dropColumn("slug").execute();
}
