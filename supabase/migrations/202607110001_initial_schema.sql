create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.template_visibility as enum ('private', 'curated');
create type public.catalog_status as enum ('pending', 'processing', 'ready', 'partial', 'failed');
create type public.character_status as enum ('active', 'trashed');
create type public.character_role as enum ('owner', 'editor');
create type public.field_kind as enum (
  'text', 'multiline', 'checkbox', 'radio', 'dropdown', 'list', 'button', 'signature', 'unknown'
);
create type public.catalog_source as enum ('pdf', 'heuristic', 'ocr', 'vision', 'manual');
create type public.proposal_status as enum ('pending', 'applied', 'rejected', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'ru' check (locale in ('ru', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pdf_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  visibility public.template_visibility not null default 'private',
  title text not null check (char_length(title) between 1 and 160),
  game_system text,
  storage_path text not null unique,
  sha256 text not null,
  page_count integer not null check (page_count between 1 and 20),
  catalog_status public.catalog_status not null default 'pending',
  allow_vision boolean not null default false,
  catalog_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'curated' and owner_id is null) or (visibility = 'private' and owner_id is not null))
);

create unique index pdf_templates_private_hash_idx
  on public.pdf_templates(owner_id, sha256)
  where visibility = 'private';

create table public.pdf_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pdf_templates(id) on delete cascade,
  pdf_name text not null,
  kind public.field_kind not null,
  default_value jsonb,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  auto_label text,
  auto_aliases text[] not null default '{}',
  auto_section text,
  page integer not null check (page between 1 and 20),
  auto_group_id uuid,
  auto_group_order integer,
  confidence real not null default 0 check (confidence between 0 and 1),
  source public.catalog_source not null default 'pdf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, pdf_name)
);

create index pdf_fields_search_idx on public.pdf_fields
  using gin ((coalesce(auto_label, '') || ' ' || pdf_name || ' ' || coalesce(auto_section, '')) gin_trgm_ops);

create table public.pdf_field_widgets (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.pdf_fields(id) on delete cascade,
  page integer not null check (page between 1 and 20),
  rect real[] not null check (array_length(rect, 1) = 4),
  pdf_rect real[] not null check (array_length(pdf_rect, 1) = 4),
  rotation integer not null default 0,
  export_value text,
  widget_index integer not null default 0,
  unique(field_id, widget_index)
);

create table public.field_catalog_overrides (
  character_id uuid not null,
  field_id uuid not null references public.pdf_fields(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 240),
  aliases text[] not null default '{}',
  section text,
  group_id uuid,
  group_order integer,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(character_id, field_id)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pdf_templates(id),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status public.character_status not null default 'active',
  revision bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.field_catalog_overrides
  add constraint field_catalog_overrides_character_fk
  foreign key (character_id) references public.characters(id) on delete cascade;

create index characters_owner_idx on public.characters(owner_id, status, updated_at desc);

create table public.character_members (
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.character_role not null default 'editor' check (role = 'editor'),
  created_at timestamptz not null default now(),
  primary key(character_id, user_id)
);

create table public.character_values (
  character_id uuid not null references public.characters(id) on delete cascade,
  field_id uuid not null references public.pdf_fields(id) on delete cascade,
  value jsonb,
  version integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(character_id, field_id)
);

create index character_values_updated_idx on public.character_values(character_id, updated_at desc);

create table public.character_mutations (
  character_id uuid not null references public.characters(id) on delete cascade,
  client_mutation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.pdf_fields(id) on delete cascade,
  value jsonb,
  version integer not null,
  revision bigint not null,
  overwritten_remote boolean not null,
  created_at timestamptz not null default now(),
  primary key(character_id, client_mutation_id)
);

create table public.character_invites (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.catalog_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.pdf_templates(id) on delete cascade,
  status public.catalog_status not null default 'pending',
  current_step text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  copilot_thread_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_id, user_id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  message_id text not null,
  role text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique(thread_id, message_id)
);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_proposals(id) on delete cascade,
  field_id uuid not null references public.pdf_fields(id),
  old_value jsonb,
  new_value jsonb,
  expected_version integer not null,
  reason text not null,
  confidence real not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create or replace view public.effective_pdf_fields
with (security_invoker = true) as
select
  f.id,
  f.template_id,
  f.pdf_name,
  f.kind,
  f.default_value,
  f.options,
  coalesce(f.auto_label, f.pdf_name) as label,
  f.auto_aliases as aliases,
  f.auto_section as section,
  f.page,
  f.auto_group_id as group_id,
  f.auto_group_order as group_order,
  f.confidence,
  f.source,
  f.updated_at
from public.pdf_fields f;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.pdf_templates
for each row execute function public.set_updated_at();
create trigger fields_updated_at before update on public.pdf_fields
for each row execute function public.set_updated_at();
create trigger characters_updated_at before update on public.characters
for each row execute function public.set_updated_at();
create trigger catalog_jobs_updated_at before update on public.catalog_jobs
for each row execute function public.set_updated_at();
create trigger ai_threads_updated_at before update on public.ai_threads
for each row execute function public.set_updated_at();
create trigger ai_proposals_updated_at before update on public.ai_proposals
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_character_owner(character_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.characters c
    where c.id = character_uuid and c.owner_id = auth.uid()
  );
$$;

create or replace function public.can_access_character(character_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.characters c
    where c.id = character_uuid
      and (
        c.owner_id = auth.uid()
        or (c.status = 'active' and exists (
          select 1 from public.character_members m
          where m.character_id = c.id and m.user_id = auth.uid()
        ))
      )
  );
$$;

create or replace function public.can_edit_character(character_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.characters c
    where c.id = character_uuid and c.status = 'active'
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from public.character_members m
          where m.character_id = c.id and m.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_access_template(template_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pdf_templates t
    where t.id = template_uuid
      and (
        t.visibility = 'curated'
        or t.owner_id = auth.uid()
        or exists (
          select 1 from public.characters c
          where c.template_id = t.id and public.can_access_character(c.id)
        )
      )
  );
$$;

create or replace function public.field_value_is_valid(field_uuid uuid, candidate jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  field_record public.pdf_fields%rowtype;
  option_value text;
begin
  select * into field_record from public.pdf_fields where id = field_uuid;
  if not found then return false; end if;
  if candidate is null or jsonb_typeof(candidate) = 'null' then return true; end if;

  if field_record.kind in ('text', 'multiline') then
    return jsonb_typeof(candidate) = 'string' and char_length(candidate #>> '{}') <= 20000;
  elsif field_record.kind = 'checkbox' then
    return jsonb_typeof(candidate) = 'boolean';
  elsif field_record.kind in ('radio', 'dropdown') then
    if jsonb_typeof(candidate) <> 'string' then return false; end if;
    option_value := candidate #>> '{}';
    return jsonb_array_length(field_record.options) = 0 or field_record.options @> jsonb_build_array(option_value);
  elsif field_record.kind = 'list' then
    return jsonb_typeof(candidate) in ('array', 'string');
  end if;
  return false;
end;
$$;

create or replace function public.update_character_field(
  p_character_id uuid,
  p_field_id uuid,
  p_value jsonb,
  p_expected_version integer,
  p_client_mutation_id uuid
)
returns table(value jsonb, version integer, revision bigint, overwritten_remote boolean)
language plpgsql security definer set search_path = public as $$
declare
  current_value public.character_values%rowtype;
  existing_mutation public.character_mutations%rowtype;
  new_revision bigint;
  was_overwritten boolean;
begin
  if not public.can_edit_character(p_character_id) then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.characters c
    join public.pdf_fields f on f.template_id = c.template_id
    where c.id = p_character_id and f.id = p_field_id
  ) then raise exception 'field_not_in_character'; end if;
  if not public.field_value_is_valid(p_field_id, p_value) then raise exception 'invalid_field_value'; end if;

  select * into existing_mutation from public.character_mutations
  where character_id = p_character_id and client_mutation_id = p_client_mutation_id;
  if found then
    return query select existing_mutation.value, existing_mutation.version,
      existing_mutation.revision, existing_mutation.overwritten_remote;
    return;
  end if;

  select * into current_value from public.character_values
  where character_id = p_character_id and field_id = p_field_id for update;

  if not found then
    insert into public.character_values(character_id, field_id, value, version, updated_by)
    values (p_character_id, p_field_id, p_value, 1, auth.uid())
    returning * into current_value;
    was_overwritten := p_expected_version <> 0;
  else
    was_overwritten := current_value.version <> p_expected_version;
    update public.character_values
    set value = p_value, version = current_value.version + 1, updated_by = auth.uid(), updated_at = now()
    where character_id = p_character_id and field_id = p_field_id
    returning * into current_value;
  end if;

  update public.characters as c set revision = c.revision + 1
  where c.id = p_character_id returning c.revision into new_revision;

  insert into public.character_mutations(
    character_id, client_mutation_id, user_id, field_id, value, version, revision, overwritten_remote
  ) values (
    p_character_id, p_client_mutation_id, auth.uid(), p_field_id, current_value.value,
    current_value.version, new_revision, was_overwritten
  );

  return query select current_value.value, current_value.version, new_revision, was_overwritten;
end;
$$;

create or replace function public.clone_character(p_character_id uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  source_character public.characters%rowtype;
  new_id uuid;
begin
  select * into source_character from public.characters where id = p_character_id;
  if not found or source_character.owner_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into public.characters(template_id, owner_id, name)
  values (source_character.template_id, auth.uid(), coalesce(nullif(trim(p_name), ''), source_character.name || ' — copy'))
  returning id into new_id;
  insert into public.character_values(character_id, field_id, value, version, updated_by)
  select new_id, field_id, value, 0, auth.uid() from public.character_values
  where character_id = p_character_id;
  return new_id;
end;
$$;

create or replace function public.set_character_trashed(p_character_id uuid, p_trashed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_character_owner(p_character_id) then raise exception 'forbidden'; end if;
  if p_trashed then
    update public.characters set status = 'trashed', deleted_at = now() where id = p_character_id;
  else
    update public.characters set status = 'active', deleted_at = null
    where id = p_character_id and deleted_at > now() - interval '30 days';
    if not found then raise exception 'restore_window_expired'; end if;
  end if;
end;
$$;

create or replace function public.accept_character_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  invite_record public.character_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into invite_record from public.character_invites
  where token_hash = p_token_hash and revoked_at is null and accepted_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invalid_invite'; end if;
  if exists (select 1 from public.characters where id = invite_record.character_id and owner_id = auth.uid()) then
    raise exception 'owner_cannot_accept';
  end if;
  insert into public.character_members(character_id, user_id)
  values (invite_record.character_id, auth.uid()) on conflict do nothing;
  update public.character_invites set accepted_by = auth.uid(), accepted_at = now()
  where id = invite_record.id;
  return invite_record.character_id;
end;
$$;

create or replace function public.apply_ai_proposal(p_proposal_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  proposal_record public.ai_proposals%rowtype;
  selected jsonb;
  item_record public.ai_proposal_items%rowtype;
  current_version integer;
  next_revision bigint;
  applied jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  select * into proposal_record from public.ai_proposals
  where id = p_proposal_id and user_id = auth.uid() and status = 'pending' for update;
  if not found or not public.can_edit_character(proposal_record.character_id) then raise exception 'forbidden'; end if;

  for selected in select * from jsonb_array_elements(p_items)
  loop
    select * into item_record from public.ai_proposal_items
    where id = (selected ->> 'itemId')::uuid and proposal_id = p_proposal_id;
    if not found then continue; end if;
    select version into current_version from public.character_values
    where character_id = proposal_record.character_id and field_id = item_record.field_id for update;
    current_version := coalesce(current_version, 0);

    if current_version <> item_record.expected_version
      or not public.field_value_is_valid(item_record.field_id, selected -> 'value') then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'itemId', item_record.id, 'fieldId', item_record.field_id, 'currentVersion', current_version
      ));
      continue;
    end if;

    insert into public.character_values(character_id, field_id, value, version, updated_by)
    values (proposal_record.character_id, item_record.field_id, selected -> 'value', 1, auth.uid())
    on conflict(character_id, field_id) do update
      set value = excluded.value, version = character_values.version + 1,
          updated_by = auth.uid(), updated_at = now();
    update public.characters set revision = revision + 1
    where id = proposal_record.character_id returning revision into next_revision;
    applied := applied || jsonb_build_array(jsonb_build_object(
      'itemId', item_record.id, 'fieldId', item_record.field_id, 'revision', next_revision
    ));
  end loop;

  update public.ai_proposals
  set status = case
    when jsonb_array_length(conflicts) = 0 then 'applied'::public.proposal_status
    else 'pending'::public.proposal_status
  end
  where id = p_proposal_id;
  return jsonb_build_object('applied', applied, 'conflicts', conflicts);
end;
$$;

alter table public.profiles enable row level security;
alter table public.pdf_templates enable row level security;
alter table public.pdf_fields enable row level security;
alter table public.pdf_field_widgets enable row level security;
alter table public.field_catalog_overrides enable row level security;
alter table public.characters enable row level security;
alter table public.character_members enable row level security;
alter table public.character_values enable row level security;
alter table public.character_mutations enable row level security;
alter table public.character_invites enable row level security;
alter table public.catalog_jobs enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_proposals enable row level security;
alter table public.ai_proposal_items enable row level security;

create policy "profiles_read_self" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "templates_read_accessible" on public.pdf_templates for select using (public.can_access_template(id));
create policy "templates_insert_private" on public.pdf_templates for insert with check (owner_id = auth.uid() and visibility = 'private');
create policy "templates_update_owner" on public.pdf_templates for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "templates_delete_owner" on public.pdf_templates for delete using (owner_id = auth.uid());

create policy "fields_read_template" on public.pdf_fields for select using (public.can_access_template(template_id));
create policy "widgets_read_template" on public.pdf_field_widgets for select using (
  exists (select 1 from public.pdf_fields f where f.id = field_id and public.can_access_template(f.template_id))
);
create policy "overrides_read_template" on public.field_catalog_overrides for select using (
  public.can_access_character(character_id)
);
create policy "overrides_owner_write" on public.field_catalog_overrides for all using (
  public.is_character_owner(character_id)
) with check (
  updated_by = auth.uid() and public.is_character_owner(character_id) and exists (
    select 1 from public.pdf_fields f join public.characters c on c.template_id = f.template_id
    where f.id = field_id and c.id = character_id
  )
);

create policy "characters_read_accessible" on public.characters for select using (public.can_access_character(id));
create policy "characters_insert_owner" on public.characters for insert with check (owner_id = auth.uid());
create policy "characters_update_owner" on public.characters for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "characters_delete_owner" on public.characters for delete using (owner_id = auth.uid());

create policy "members_read_accessible" on public.character_members for select using (public.can_access_character(character_id));
create policy "members_owner_manage" on public.character_members for all using (public.is_character_owner(character_id))
with check (public.is_character_owner(character_id));

create policy "values_read_accessible" on public.character_values for select using (public.can_access_character(character_id));

create policy "invites_owner_read" on public.character_invites for select using (public.is_character_owner(character_id));
create policy "invites_owner_insert" on public.character_invites for insert with check (
  public.is_character_owner(character_id) and created_by = auth.uid()
);
create policy "invites_owner_update" on public.character_invites for update using (public.is_character_owner(character_id));

create policy "jobs_read_template" on public.catalog_jobs for select using (public.can_access_template(template_id));

create policy "threads_read_own" on public.ai_threads for select using (
  user_id = auth.uid() and public.can_access_character(character_id)
);
create policy "threads_insert_own" on public.ai_threads for insert with check (
  user_id = auth.uid() and public.can_access_character(character_id)
);
create policy "threads_update_own" on public.ai_threads for update using (user_id = auth.uid());

create policy "messages_read_own" on public.ai_messages for select using (
  exists (select 1 from public.ai_threads t where t.id = thread_id and t.user_id = auth.uid())
);
create policy "messages_insert_own" on public.ai_messages for insert with check (
  exists (select 1 from public.ai_threads t where t.id = thread_id and t.user_id = auth.uid())
);

create policy "proposals_read_own" on public.ai_proposals for select using (
  user_id = auth.uid() and public.can_access_character(character_id)
);
create policy "proposals_update_own" on public.ai_proposals for update using (
  user_id = auth.uid() and public.can_access_character(character_id)
) with check (user_id = auth.uid());
create policy "proposal_items_read_own" on public.ai_proposal_items for select using (
  exists (select 1 from public.ai_proposals p where p.id = proposal_id and p.user_id = auth.uid())
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('character-pdfs', 'character-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.effective_pdf_fields to authenticated;
grant execute on all functions in schema public to authenticated;

alter publication supabase_realtime add table public.character_values;
alter publication supabase_realtime add table public.characters;
alter publication supabase_realtime add table public.catalog_jobs;
