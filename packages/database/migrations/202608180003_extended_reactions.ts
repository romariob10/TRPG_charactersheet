import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`alter table post_reactions drop constraint if exists post_reactions_kind_check`.execute(db);
  await sql`alter table post_reactions add constraint post_reactions_kind_check check (reaction in ('like', 'fire', 'dice', 'joy', 'moai', 'mindblown'))`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`delete from post_reactions where reaction not in ('like', 'fire', 'dice')`.execute(db);
  await sql`alter table post_reactions drop constraint if exists post_reactions_kind_check`.execute(db);
  await sql`alter table post_reactions add constraint post_reactions_kind_check check (reaction in ('like', 'fire', 'dice'))`.execute(db);
}
