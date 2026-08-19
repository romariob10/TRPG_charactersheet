import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

// 202608180009_user_moderation taught the moderation service to write
// 'suspended' and 'banned' into users.status, but users_status_check still
// only accepted the original 'active' and 'disabled', so every ban or
// suspension failed with a constraint violation.
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropConstraint("users_status_check")
    .execute();

  await db.schema
    .alterTable("users")
    .addCheckConstraint(
      "users_status_check",
      sql`status in ('active', 'disabled', 'suspended', 'banned')`,
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Moderated accounts must keep being denied sign-in, and 'disabled' is the
  // only pre-existing status with that meaning.
  await sql`
    update users set status = 'disabled'
    where status in ('suspended', 'banned')
  `.execute(db);

  await db.schema
    .alterTable("users")
    .dropConstraint("users_status_check")
    .execute();

  await db.schema
    .alterTable("users")
    .addCheckConstraint(
      "users_status_check",
      sql`status in ('active', 'disabled')`,
    )
    .execute();
}
