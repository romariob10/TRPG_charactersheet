alter table public.pdf_templates
  add column deleted_at timestamptz;

create index pdf_templates_active_owner_idx
on public.pdf_templates(owner_id, updated_at desc)
where deleted_at is null;

create index pdf_templates_active_community_idx
on public.pdf_templates(catalog_approved_at desc, updated_at desc)
where deleted_at is null and is_public = true and visibility = 'private';

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
        (template.deleted_at is null and template.visibility = 'curated')
        or template.owner_id = (select auth.uid())
        or (
          template.deleted_at is null
          and template.visibility = 'private'
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

drop policy if exists "subscriptions_insert_own_public"
on public.template_subscriptions;

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
      and template.deleted_at is null
      and template.owner_id <> (select auth.uid())
      and template.visibility = 'private'
      and template.is_public = true
      and template.catalog_approved_at is not null
      and template.catalog_status in ('ready', 'partial')
  )
);
