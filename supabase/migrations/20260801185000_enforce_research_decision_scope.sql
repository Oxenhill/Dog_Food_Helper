-- Bowl recommendation evidence must measure a response in dogs, not a
-- manufacturing, product-audit, or regulatory outcome. Rejected rows remain
-- available as an audit trail, but out-of-scope outcomes cannot be queued,
-- drafted, or active even if application validation is bypassed.

alter table public.research_evidence_clusters
  add constraint research_evidence_clusters_dog_response_scope_check
  check (
    status = 'rejected'
    or lower(outcome_value) !~
      '(contaminat|antimicrobial resistance|antibiotic resistance|drug resistance|pathogen (detection|prevalence|rate|load)|label accuracy|labeling accuracy|labelling accuracy|mislabel|undeclared (animal species|ingredient|protein)|composition variability|manufactur(e|ed|er|ing) (defect|quality|control)|product recall)'
  );

comment on constraint research_evidence_clusters_dog_response_scope_check
  on public.research_evidence_clusters
is 'Queued/draft/active recommendation evidence must concern a dog response, not product contamination, manufacturing, labelling, recall, or composition auditing.';
