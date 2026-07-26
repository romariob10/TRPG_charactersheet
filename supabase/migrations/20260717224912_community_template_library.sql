alter table public.pdf_templates
  add column is_public boolean not null default false;

update public.pdf_templates
set is_public = true
where visibility = 'curated';

create table public.template_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.pdf_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

create index template_subscriptions_template_idx
on public.template_subscriptions(template_id, created_at desc);

create index pdf_templates_community_idx
on public.pdf_templates(catalog_approved_at desc, updated_at desc)
where is_public = true and visibility = 'private';

create index pdf_templates_community_hash_idx
on public.pdf_templates(sha256)
where is_public = true and visibility = 'private';

create or replace function public.can_access_template(template_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pdf_templates as template
    where template.id = template_uuid
      and (
        template.visibility = 'curated'
        or template.owner_id = (select auth.uid())
        or (
          template.visibility = 'private'
          and template.is_public = true
          and template.catalog_approved_at is not null
          and template.catalog_status in ('ready', 'partial')
        )
        or exists (
          select 1
          from public.characters as character
          where character.template_id = template.id
            and public.can_access_character(character.id)
        )
      )
  );
$$;

revoke execute on function public.can_access_template(uuid) from public, anon;
grant execute on function public.can_access_template(uuid) to authenticated;

alter table public.template_subscriptions enable row level security;

create policy "subscriptions_read_own"
on public.template_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "subscriptions_insert_own_public"
on public.template_subscriptions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.pdf_templates as template
    where template.id = template_id
      and template.owner_id <> (select auth.uid())
      and template.visibility = 'private'
      and template.is_public = true
      and template.catalog_approved_at is not null
      and template.catalog_status in ('ready', 'partial')
  )
);

create policy "subscriptions_delete_own"
on public.template_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, delete on public.template_subscriptions to authenticated;
