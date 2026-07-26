create or replace function public.normalize_pdf_field_catalog_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.auto_label := upper(
    coalesce(nullif(btrim(new.auto_label), ''), btrim(new.pdf_name))
  );
  new.auto_section := nullif(upper(btrim(new.auto_section)), '');
  return new;
end;
$$;

create or replace function public.normalize_catalog_override_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.label := upper(btrim(new.label));
  new.section := nullif(upper(btrim(new.section)), '');
  return new;
end;
$$;

revoke all on function public.normalize_pdf_field_catalog_names() from public, anon, authenticated;
revoke all on function public.normalize_catalog_override_names() from public, anon, authenticated;

update public.pdf_fields
set
  auto_label = upper(
    coalesce(nullif(btrim(auto_label), ''), btrim(pdf_name))
  ),
  auto_section = nullif(upper(btrim(auto_section)), '');

update public.field_catalog_overrides
set
  label = upper(btrim(label)),
  section = nullif(upper(btrim(section)), '');

alter table public.pdf_fields
  add constraint pdf_fields_auto_label_uppercase
  check (
    auto_label is not null
    and auto_label <> ''
    and auto_label = upper(btrim(auto_label))
  ),
  add constraint pdf_fields_auto_section_uppercase
  check (
    auto_section is null
    or (
      auto_section <> ''
      and auto_section = upper(btrim(auto_section))
    )
  );

alter table public.field_catalog_overrides
  add constraint field_catalog_overrides_label_uppercase
  check (label <> '' and label = upper(btrim(label))),
  add constraint field_catalog_overrides_section_uppercase
  check (
    section is null
    or (
      section <> ''
      and section = upper(btrim(section))
    )
  );

create trigger normalize_pdf_field_catalog_names_before_write
before insert or update of auto_label, auto_section, pdf_name
on public.pdf_fields
for each row execute function public.normalize_pdf_field_catalog_names();

create trigger normalize_catalog_override_names_before_write
before insert or update of label, section
on public.field_catalog_overrides
for each row execute function public.normalize_catalog_override_names();

create or replace view public.effective_pdf_fields
with (security_invoker = true) as
select
  f.id,
  f.template_id,
  f.pdf_name,
  f.kind,
  f.default_value,
  f.options,
  upper(coalesce(f.auto_label, f.pdf_name)) as label,
  f.auto_aliases as aliases,
  case when f.auto_section is null then null else upper(f.auto_section) end as section,
  f.page,
  f.auto_group_id as group_id,
  f.auto_group_order as group_order,
  f.confidence,
  f.source,
  f.updated_at
from public.pdf_fields f;
