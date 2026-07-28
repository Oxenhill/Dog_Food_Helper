-- Classification is a document finding in its own right, not a biome marker.
alter table public.dog_document_findings
  drop constraint dog_document_findings_finding_type_check;

alter table public.dog_document_findings
  add constraint dog_document_findings_finding_type_check
  check (
    finding_type in (
      'biome_marker',
      'classification',
      'allergen_reactive',
      'allergen_clear'
    )
  );
