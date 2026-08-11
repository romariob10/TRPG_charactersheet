import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("profiles")
    .addColumn("username", "text")
    .addColumn("bio", "text", (col) => col.notNull().defaultTo(""))
    .execute();

  await sql`
    with normalized as (
      select
        profile.id as profile_id,
        case
          when trim(
            both '-' from regexp_replace(
              regexp_replace(lower(split_part(user_row.email, '@', 1)), '[^a-z0-9_-]+', '-', 'g'),
              '-{2,}', '-', 'g'
            )
          ) ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
          then trim(
            both '-' from regexp_replace(
              regexp_replace(lower(split_part(user_row.email, '@', 1)), '[^a-z0-9_-]+', '-', 'g'),
              '-{2,}', '-', 'g'
            )
          )
          else null
        end as candidate
      from profiles as profile
      join users as user_row on user_row.id = profile.id
    ),
    numbered as (
      select
        profile_id,
        candidate,
        row_number() over (partition by candidate order by profile_id) as position
      from normalized
    )
    update profiles as profile
    set username = case
      when numbered.candidate is not null and numbered.position = 1 then numbered.candidate
      else 'user-' || left(replace(profile.id::text, '-', ''), 8)
    end
    from numbered
    where profile.id = numbered.profile_id
  `.execute(db);

  await sql`
    do $$
    declare
      conflict record;
      candidate text;
      suffix int;
    begin
      for conflict in
        select profile.id, profile.username
        from profiles as profile
        join profiles as earlier
          on earlier.username = profile.username and earlier.id < profile.id
        order by profile.id
      loop
        candidate := 'user-' || left(replace(conflict.id::text, '-', ''), 8);
        suffix := 2;
        while exists (select 1 from profiles where username = candidate) loop
          candidate := 'user-' || left(replace(conflict.id::text, '-', ''), 8) || '-' || suffix;
          suffix := suffix + 1;
        end loop;
        update profiles set username = candidate where id = conflict.id;
      end loop;
    end $$;
  `.execute(db);

  await sql`
    alter table profiles
    alter column username set not null,
    add constraint profiles_username_check check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
    add constraint profiles_bio_check check (char_length(bio) <= 500)
  `.execute(db);
  await sql`create unique index profiles_username_idx on profiles (lower(username))`.execute(db);

  await db.schema.alterTable("pdf_templates").addColumn("slug", "text").execute();
  await sql`
    update pdf_templates
    set slug = 'template-' || left(replace(id::text, '-', ''), 8)
  `.execute(db);
  await sql`
    do $$
    declare
      conflict record;
      candidate text;
      suffix int;
    begin
      for conflict in
        select template.id, template.owner_id, template.slug
        from pdf_templates as template
        join pdf_templates as earlier
          on earlier.owner_id = template.owner_id
          and earlier.slug = template.slug
          and earlier.id < template.id
        where template.owner_id is not null
        order by template.id
      loop
        suffix := 2;
        candidate := conflict.slug || '-' || suffix;
        while exists (
          select 1 from pdf_templates
          where owner_id = conflict.owner_id and slug = candidate
        ) loop
          suffix := suffix + 1;
          candidate := conflict.slug || '-' || suffix;
        end loop;
        update pdf_templates set slug = candidate where id = conflict.id;
      end loop;
    end $$;
  `.execute(db);

  await sql`
    alter table pdf_templates
    alter column slug set not null,
    add constraint pdf_templates_slug_check
      check (char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  `.execute(db);
  await sql`
    create unique index pdf_templates_owner_slug_idx
    on pdf_templates(owner_id, slug)
    where owner_id is not null
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`drop index if exists pdf_templates_owner_slug_idx`.execute(db);
  await sql`alter table pdf_templates drop constraint if exists pdf_templates_slug_check`.execute(db);
  await db.schema.alterTable("pdf_templates").dropColumn("slug").execute();
  await sql`drop index if exists profiles_username_idx`.execute(db);
  await sql`alter table profiles drop constraint if exists profiles_username_check`.execute(db);
  await sql`alter table profiles drop constraint if exists profiles_bio_check`.execute(db);
  await db.schema
    .alterTable("profiles")
    .dropColumn("username")
    .dropColumn("bio")
    .execute();
}
