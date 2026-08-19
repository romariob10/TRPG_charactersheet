import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

// character_values.updated_by and character_invites.accepted_by record who acted
// but had no delete rule, so deleting an account failed as soon as the person
// had edited one sheet or accepted one invite. Both columns are nullable, so the
// record survives and only the attribution is dropped.
const attributions = [
  {
    table: "character_values",
    column: "updated_by",
    constraint: "character_values_updated_by_fkey",
  },
  {
    table: "character_invites",
    column: "accepted_by",
    constraint: "character_invites_accepted_by_fkey",
  },
] as const;

export async function up(db: Kysely<Database>): Promise<void> {
  for (const { table, column, constraint } of attributions) {
    await sql`
      alter table ${sql.id(table)}
      drop constraint ${sql.id(constraint)}
    `.execute(db);

    await sql`
      alter table ${sql.id(table)}
      add constraint ${sql.id(constraint)}
      foreign key (${sql.id(column)}) references users (id) on delete set null
    `.execute(db);
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const { table, column, constraint } of attributions) {
    await sql`
      alter table ${sql.id(table)}
      drop constraint ${sql.id(constraint)}
    `.execute(db);

    await sql`
      alter table ${sql.id(table)}
      add constraint ${sql.id(constraint)}
      foreign key (${sql.id(column)}) references users (id)
    `.execute(db);
  }
}
