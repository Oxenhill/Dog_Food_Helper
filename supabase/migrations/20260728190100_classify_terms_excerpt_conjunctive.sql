-- Adds pattern_all_of support: when set, every element must match (~*)
-- for the row to count, instead of the single `pattern` column.

create or replace function public.classify_terms_excerpt(p_excerpt text, p_recon_status text)
returns table(pattern_id uuid, shape text, decision text, confidence text)
language plpgsql
stable
as $$
declare
  rec record;
  is_match boolean;
begin
  if p_recon_status = 'no_terms_found' then
    select id, tcp.shape, tcp.default_decision into rec
    from public.terms_clause_patterns tcp
    where tcp.shape = 'no_content_clause' and tcp.active
    order by priority limit 1;
    return query select rec.id, rec.shape, rec.default_decision, 'high'::text;
    return;
  end if;

  if p_excerpt is null then
    return query select null::uuid, null::text, null::text, 'none'::text;
    return;
  end if;

  for rec in
    select tcp.id, tcp.shape, tcp.default_decision, tcp.pattern, tcp.pattern_all_of
    from public.terms_clause_patterns tcp
    where tcp.active
    order by tcp.priority, tcp.id
  loop
    if rec.pattern_all_of is not null then
      select bool_and(p_excerpt ~* elem) into is_match from unnest(rec.pattern_all_of) as elem;
    else
      is_match := p_excerpt ~* rec.pattern;
    end if;

    if is_match then
      return query select rec.id, rec.shape, rec.default_decision, 'high'::text;
      return;
    end if;
  end loop;

  return query select null::uuid, null::text, null::text, 'none'::text;
end;
$$;
