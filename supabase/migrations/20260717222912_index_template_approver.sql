create index pdf_templates_catalog_approved_by_idx
on public.pdf_templates(catalog_approved_by)
where catalog_approved_by is not null;
