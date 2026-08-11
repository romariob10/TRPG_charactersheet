import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`drop index if exists pdf_templates_private_hash_idx`.execute(db);
  await sql`
    create unique index pdf_templates_private_hash_idx
    on pdf_templates(owner_id, sha256)
    where visibility = 'private' and deleted_at is null
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`drop index if exists pdf_templates_private_hash_idx`.execute(db);
  try {
    await sql`
      create unique index pdf_templates_private_hash_idx
      on pdf_templates(owner_id, sha256)
      where visibility = 'private'
    `.execute(db);
  } catch (error) {
    // Rollback is only possible while no owner has both an active and a
    // soft-deleted template with identical content. PostgreSQL refuses to
    // build the old index otherwise, so fail loudly instead of leaving the
    // duplicate protection silently disabled.
    throw new Error(
      "Cannot restore pdf_templates_private_hash_idx: an owner has an active and a deleted template with the same sha256. Purge or restore the conflicting deleted row first.",
      { cause: error },
    );
  }
}
