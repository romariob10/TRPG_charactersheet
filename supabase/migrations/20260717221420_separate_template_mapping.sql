drop trigger if exists normalize_pdf_field_catalog_names_before_write
on public.pdf_fields;
drop trigger if exists normalize_catalog_override_names_before_write
on public.field_catalog_overrides;

alter table public.pdf_fields
  drop constraint if exists pdf_fields_auto_label_uppercase,
  drop constraint if exists pdf_fields_auto_section_uppercase;

alter table public.field_catalog_overrides
  drop constraint if exists field_catalog_overrides_label_uppercase,
  drop constraint if exists field_catalog_overrides_section_uppercase;

drop function if exists public.normalize_pdf_field_catalog_names();
drop function if exists public.normalize_catalog_override_names();

alter table public.pdf_templates
  add column catalog_approved_at timestamptz,
  add column catalog_approved_by uuid references auth.users(id) on delete set null;

alter table public.pdf_fields
  add column is_enabled boolean not null default true;

with latest_owner_override as (
  select distinct on (override.field_id)
    override.field_id,
    override.label,
    override.aliases,
    override.section,
    override.group_id,
    override.group_order
  from public.field_catalog_overrides as override
  join public.characters as character
    on character.id = override.character_id
  join public.pdf_templates as template
    on template.id = character.template_id
  where template.owner_id = character.owner_id
  order by override.field_id, override.updated_at desc
)
update public.pdf_fields as field
set
  auto_label = owner_override.label,
  auto_aliases = owner_override.aliases,
  auto_section = owner_override.section,
  auto_group_id = owner_override.group_id,
  auto_group_order = owner_override.group_order,
  confidence = 1,
  source = 'manual'
from latest_owner_override as owner_override
where owner_override.field_id = field.id;

update public.pdf_fields
set
  auto_label = upper(left(lower(btrim(auto_label)), 1))
    || substring(lower(btrim(auto_label)) from 2),
  auto_section = case
    when nullif(btrim(auto_section), '') is null then null
    else upper(left(lower(btrim(auto_section)), 1))
      || substring(lower(btrim(auto_section)) from 2)
  end;

update public.field_catalog_overrides
set
  label = upper(left(lower(btrim(label)), 1))
    || substring(lower(btrim(label)) from 2),
  section = case
    when nullif(btrim(section), '') is null then null
    else upper(left(lower(btrim(section)), 1))
      || substring(lower(btrim(section)) from 2)
  end;

update public.pdf_templates
set
  catalog_approved_at = now(),
  catalog_approved_by = owner_id
where visibility = 'curated'
  and catalog_status in ('ready', 'partial');

create index pdf_templates_owner_approval_idx
on public.pdf_templates(owner_id, catalog_approved_at, updated_at desc);

create or replace view public.effective_pdf_fields
with (security_invoker = true) as
select
  field.id,
  field.template_id,
  field.pdf_name,
  field.kind,
  field.default_value,
  field.options,
  coalesce(nullif(btrim(field.auto_label), ''), field.pdf_name) as label,
  field.auto_aliases as aliases,
  nullif(btrim(field.auto_section), '') as section,
  field.page,
  field.auto_group_id as group_id,
  field.auto_group_order as group_order,
  field.confidence,
  field.source,
  field.updated_at,
  field.is_enabled
from public.pdf_fields as field;
