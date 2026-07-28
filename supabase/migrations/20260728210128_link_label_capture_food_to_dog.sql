-- A confirmed owner label capture is one unit of work:
--   1. create the food and its ingredient rows (or record an observation of
--      an existing food);
--   2. attach that catalogue row to the dog and its current food event.
--
-- Keeping this in one Postgres function means an error in any step rolls the
-- entire capture back. In particular, a complete-looking orphan `foods` row
-- can no longer survive a failed dog/event link.
create or replace function public.confirm_label_food_for_dog(
  p_owner_id uuid,
  p_dog_id uuid,
  p_existing_food_id uuid,
  p_food jsonb,
  p_ingredients jsonb,
  p_review_observation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dog_id uuid;
  v_food public.foods%rowtype;
  v_open_event_id uuid;
  v_open_food_id uuid;
  v_event_id uuid;
  v_submission_id uuid;
  v_now timestamptz := clock_timestamp();
  v_outcome text;
  v_ingredients_saved integer := 0;
begin
  -- The API uses service_role, so RLS is not the ownership boundary here.
  -- Check ownership explicitly and lock the dog for the whole transaction.
  select d.id
    into v_dog_id
  from public.dogs as d
  where d.id = p_dog_id
    and d.owner_id = p_owner_id
  for update;

  if v_dog_id is null then
    raise exception 'Dog not found for this owner'
      using errcode = 'P0001';
  end if;

  if p_existing_food_id is null then
    if jsonb_typeof(p_food) <> 'object' then
      raise exception 'Food payload must be a JSON object'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_ingredients) <> 'array'
       or jsonb_array_length(p_ingredients) = 0 then
      raise exception 'At least one ingredient is required'
        using errcode = '22023';
    end if;

    insert into public.foods (
      brand,
      name,
      food_type,
      calories_per_kg,
      protein_pct,
      fat_pct,
      fibre_pct,
      moisture_pct,
      ash_pct,
      phosphorus_pct,
      sodium_pct,
      calcium_pct,
      linoleic_acid_pct,
      epa_dha_pct,
      omega3_pct,
      ingredient_data_status,
      product_availability_status,
      ingredient_status_reason,
      ingredient_status_checked_at,
      recipe_version_status,
      ingredient_source,
      submitted_by,
      is_treat,
      gtin,
      composition_raw,
      dietetic_feeding_duration,
      last_verified_at
    )
    values (
      btrim(p_food ->> 'brand'),
      btrim(p_food ->> 'name'),
      (p_food ->> 'food_type')::public.food_type,
      nullif(p_food ->> 'calories_per_kg', '')::numeric,
      nullif(p_food ->> 'protein_pct', '')::numeric,
      nullif(p_food ->> 'fat_pct', '')::numeric,
      nullif(p_food ->> 'fibre_pct', '')::numeric,
      nullif(p_food ->> 'moisture_pct', '')::numeric,
      nullif(p_food ->> 'ash_pct', '')::numeric,
      nullif(p_food ->> 'phosphorus_pct', '')::numeric,
      nullif(p_food ->> 'sodium_pct', '')::numeric,
      nullif(p_food ->> 'calcium_pct', '')::numeric,
      nullif(p_food ->> 'linoleic_acid_pct', '')::numeric,
      nullif(p_food ->> 'epa_dha_pct', '')::numeric,
      nullif(p_food ->> 'omega3_pct', '')::numeric,
      p_food ->> 'ingredient_data_status',
      'available',
      nullif(p_food ->> 'ingredient_status_reason', ''),
      v_now,
      'current',
      'label_photo',
      p_owner_id,
      coalesce(nullif(p_food ->> 'is_treat', '')::boolean, false),
      nullif(p_food ->> 'gtin', ''),
      nullif(p_food ->> 'composition_raw', ''),
      nullif(p_food ->> 'dietetic_feeding_duration', ''),
      v_now
    )
    returning * into v_food;

    if v_food.brand is null or v_food.brand = ''
       or v_food.name is null or v_food.name = '' then
      raise exception 'Brand and product name are required'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_ingredients) as item
      where nullif(btrim(item ->> 'ingredient_name'), '') is null
    ) then
      raise exception 'Ingredient names cannot be empty'
        using errcode = '22023';
    end if;

    insert into public.food_ingredients (
      food_id,
      ingredient_name,
      ingredient_category,
      position_in_list
    )
    select
      v_food.id,
      btrim(item.value ->> 'ingredient_name'),
      nullif(btrim(item.value ->> 'ingredient_category'), ''),
      item.ordinality::integer
    from jsonb_array_elements(p_ingredients) with ordinality as item(value, ordinality);

    get diagnostics v_ingredients_saved = row_count;
    v_outcome := 'created';
  else
    select f.*
      into v_food
    from public.foods as f
    where f.id = p_existing_food_id;

    if v_food.id is null then
      raise exception 'Existing food not found'
        using errcode = 'P0001';
    end if;

    if p_review_observation is not null then
      if jsonb_typeof(p_review_observation) <> 'object' then
        raise exception 'Review observation must be a JSON object'
          using errcode = '22023';
      end if;

      insert into public.ingredient_review_queue (
        raw_ocr_json,
        submitted_by,
        dog_id,
        status
      )
      values (
        p_review_observation,
        p_owner_id,
        p_dog_id,
        'pending'
      )
      returning id into v_submission_id;

      v_outcome := 'already_known';
    else
      -- Used by the audited backfill path: link a proven existing row without
      -- manufacturing a new packet-review observation.
      v_outcome := 'linked_existing';
    end if;
  end if;

  if v_food.is_treat then
    -- Treats must not replace the dog's current main meal, but the capture is
    -- still linked to the dog rather than becoming an orphan catalogue row.
    insert into public.dog_food_events (
      dog_id,
      food_or_treat_id,
      food_or_treat_freetext,
      event_type,
      started_at,
      ended_at,
      in_transition_until
    )
    values (
      p_dog_id,
      v_food.id,
      null,
      'treat',
      v_now,
      null,
      null
    )
    returning id into v_event_id;
  else
    select e.id, e.food_or_treat_id
      into v_open_event_id, v_open_food_id
    from public.dog_food_events as e
    where e.dog_id = p_dog_id
      and e.event_type = 'main_food'
      and e.ended_at is null
    order by e.started_at desc
    limit 1
    for update;

    if v_open_event_id is not null
       and (v_open_food_id is null or v_open_food_id = v_food.id) then
      -- Resolving free text is not a food switch. Preserve the original
      -- started_at and attach the catalogue identity to that same event.
      update public.dog_food_events
      set food_or_treat_id = v_food.id,
          food_or_treat_freetext = null
      where id = v_open_event_id
      returning id into v_event_id;
    else
      if v_open_event_id is not null then
        update public.dog_food_events
        set ended_at = v_now
        where id = v_open_event_id;
      end if;

      insert into public.dog_food_events (
        dog_id,
        food_or_treat_id,
        food_or_treat_freetext,
        event_type,
        started_at,
        ended_at,
        in_transition_until
      )
      values (
        p_dog_id,
        v_food.id,
        null,
        'main_food',
        v_now,
        null,
        case
          when v_open_event_id is not null then v_now + interval '10 days'
          else null
        end
      )
      returning id into v_event_id;
    end if;

    update public.dogs
    set current_food_id = v_food.id,
        current_food_freetext = null,
        updated_at = v_now
    where id = p_dog_id;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'food_id', v_food.id,
    'brand', v_food.brand,
    'name', v_food.name,
    'is_treat', v_food.is_treat,
    'event_id', v_event_id,
    'submission_id', v_submission_id,
    'ingredients_saved', v_ingredients_saved
  );
end;
$$;

comment on function public.confirm_label_food_for_dog(uuid, uuid, uuid, jsonb, jsonb, jsonb) is
  'Atomically creates or resolves an owner-confirmed label food, writes its ingredients/review observation, and links the resulting food row to the dog food event (and current-food pointer for meals).';

revoke execute on function public.confirm_label_food_for_dog(uuid, uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_label_food_for_dog(uuid, uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
