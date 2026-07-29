import { supabaseAdmin } from './supabase';
import {
  DietComponentInput,
  DietExposureAudit,
  DogDietComponent,
  DogDietPeriod,
} from './types';

export const DEFAULT_DIET_TRANSITION_DAYS = 10;
export const MAX_DIET_TRANSITION_DAYS = 60;

const VALID_ROLES = new Set(['topper', 'mixer', 'supplement', 'treat']);
const VALID_SHARES = new Set(['most', 'about_half', 'small_amount', 'spoonful']);
const VALID_SCHEDULES = new Set([
  'every_meal',
  'daily',
  'specific_days',
  'rotating',
  'occasional',
]);
const VALID_MEAL_SLOTS = new Set(['morning', 'evening', 'any']);

const PERIOD_SELECT = `
  *,
  components:dog_diet_components(
    *,
    food:foods!dog_diet_components_food_id_fkey(
      id,
      brand,
      name,
      food_type,
      is_treat,
      ingredient_data_status
    )
  )
`;

function normaliseOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function validateDietComponents(value: unknown): DietComponentInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('At least one diet component is required');
  }

  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Diet component ${index + 1} is invalid`);
    }

    const input = raw as Record<string, unknown>;
    const foodId = normaliseOptionalText(input.food_id);
    const freetext = normaliseOptionalText(input.food_freetext);
    if ((foodId == null) === (freetext == null)) {
      throw new Error(`Diet component ${index + 1} needs either a catalogue food or a name`);
    }

    const identity = foodId ? `id:${foodId}` : `text:${freetext!.toLowerCase()}`;
    if (seen.has(identity)) throw new Error('The same food cannot appear twice in one diet');
    seen.add(identity);

    const role = normaliseOptionalText(input.role);
    const share = normaliseOptionalText(input.share);
    const schedule = normaliseOptionalText(input.schedule);
    const mealSlot = normaliseOptionalText(input.meal_slot);
    if (role && !VALID_ROLES.has(role)) throw new Error(`Diet component ${index + 1} has an invalid role`);
    if (share && !VALID_SHARES.has(share)) throw new Error(`Diet component ${index + 1} has an invalid share`);
    if (schedule && !VALID_SCHEDULES.has(schedule)) {
      throw new Error(`Diet component ${index + 1} has an invalid schedule`);
    }
    if (mealSlot && !VALID_MEAL_SLOTS.has(mealSlot)) {
      throw new Error(`Diet component ${index + 1} has an invalid meal slot`);
    }

    const days = Array.isArray(input.days_of_week)
      ? [...new Set(input.days_of_week.map(Number))].sort((a, b) => a - b)
      : null;
    if (days && days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error(`Diet component ${index + 1} has invalid days`);
    }
    if (schedule === 'specific_days' && (!days || days.length === 0)) {
      throw new Error(`Diet component ${index + 1} needs at least one day`);
    }
    if (schedule !== 'specific_days' && days) {
      throw new Error(`Diet component ${index + 1} can only set days for a specific-days schedule`);
    }

    return {
      food_id: foodId,
      food_freetext: freetext,
      role: role as DietComponentInput['role'],
      share: share as DietComponentInput['share'],
      schedule: schedule as DietComponentInput['schedule'],
      days_of_week: days,
      meal_slot: mealSlot as DietComponentInput['meal_slot'],
    };
  });
}

export function isRotatingDiet(components: DietComponentInput[]): boolean {
  return components.some(
    (component) =>
      component.schedule === 'rotating' ||
      component.schedule === 'specific_days' ||
      component.schedule === 'occasional'
  );
}

export function sameDietComponents(
  existing: DietComponentInput[],
  requested: DietComponentInput[]
): boolean {
  const canonical = (component: DietComponentInput) =>
    JSON.stringify({
      food_id: component.food_id ?? null,
      food_freetext: component.food_freetext?.trim().toLowerCase() ?? null,
      role: component.role ?? null,
      share: component.share ?? null,
      schedule: component.schedule ?? null,
      days_of_week: component.days_of_week ? [...component.days_of_week].sort((a, b) => a - b) : null,
      meal_slot: component.meal_slot ?? null,
    });
  return (
    existing.map(canonical).sort().join('|') === requested.map(canonical).sort().join('|')
  );
}

export async function listDietPeriods(dogId: string): Promise<DogDietPeriod[]> {
  const { data, error } = await supabaseAdmin
    .from('dog_diet_periods')
    .select(PERIOD_SELECT)
    .eq('dog_id', dogId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as DogDietPeriod[];
}

export async function getActiveDietPeriod(dogId: string): Promise<DogDietPeriod | null> {
  const { data, error } = await supabaseAdmin
    .from('dog_diet_periods')
    .select(PERIOD_SELECT)
    .eq('dog_id', dogId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as DogDietPeriod | null) ?? null;
}

export async function getDietPeriodAt(
  dogId: string,
  calendarDate: string
): Promise<DogDietPeriod | null> {
  const endOfDate = `${calendarDate}T23:59:59.999Z`;
  const { data, error } = await supabaseAdmin
    .from('dog_diet_periods')
    .select(PERIOD_SELECT)
    .eq('dog_id', dogId)
    .or(`started_at.is.null,started_at.lte.${endOfDate}`)
    .or(`ended_at.is.null,ended_at.gte.${calendarDate}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as DogDietPeriod | null) ?? null;
}

export async function replaceDogDiet(input: {
  dogId: string;
  components: unknown;
  startedAt?: string | null;
  transitionDays?: number | null;
}): Promise<{
  period: DogDietPeriod;
  previousPeriodId: string | null;
  monitoringWindowId: string | null;
}> {
  const components = validateDietComponents(input.components);
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) throw new Error('started_at is not a valid date');

  const requestedDays = input.transitionDays ?? DEFAULT_DIET_TRANSITION_DAYS;
  const transitionDays = Math.min(Math.max(Math.round(requestedDays), 0), MAX_DIET_TRANSITION_DAYS);

  const { data, error } = await supabaseAdmin.rpc('replace_dog_diet_period', {
    p_dog_id: input.dogId,
    p_started_at: startedAt.toISOString(),
    p_transition_days: transitionDays,
    p_components: components,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.diet_period_id) throw new Error('Diet period replacement returned no period');

  const { data: period, error: periodError } = await supabaseAdmin
    .from('dog_diet_periods')
    .select(PERIOD_SELECT)
    .eq('id', result.diet_period_id)
    .single();
  if (periodError || !period) throw periodError ?? new Error('New diet period could not be loaded');

  return {
    period: period as unknown as DogDietPeriod,
    previousPeriodId: result.previous_diet_period_id ?? null,
    monitoringWindowId: result.monitoring_window_id ?? null,
  };
}

export async function loadDietExposureAudit(
  dogId: string,
  restrictedSubstances: string[] = []
): Promise<DietExposureAudit> {
  const period = await getActiveDietPeriod(dogId);
  if (!period || period.components.length === 0) {
    return {
      status: 'not_recorded',
      diet_period_id: period?.id ?? null,
      component_count: 0,
      opaque_component_count: 0,
      ingredient_union: [],
      restricted_ingredients_present: [],
    };
  }

  const catalogueIds = period.components
    .map((component) => component.food_id)
    .filter((id): id is string => Boolean(id));

  const [{ data: foodRows, error: foodError }, { data: ingredientRows, error: ingredientError }] =
    await Promise.all([
      catalogueIds.length
        ? supabaseAdmin.from('foods').select('id, ingredient_data_status').in('id', catalogueIds)
        : Promise.resolve({ data: [], error: null }),
      catalogueIds.length
        ? supabaseAdmin.from('food_ingredients').select('food_id, ingredient_name').in('food_id', catalogueIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (foodError) throw foodError;
  if (ingredientError) throw ingredientError;

  const statusByFood = new Map((foodRows ?? []).map((row) => [row.id, row.ingredient_data_status]));
  const ingredientCountByFood = new Map<string, number>();
  const ingredientUnion = new Set<string>();
  for (const row of ingredientRows ?? []) {
    ingredientUnion.add(row.ingredient_name);
    ingredientCountByFood.set(row.food_id, (ingredientCountByFood.get(row.food_id) ?? 0) + 1);
  }

  const opaqueComponentCount = period.components.filter((component) => {
    if (!component.food_id) return true;
    return (
      statusByFood.get(component.food_id) !== 'complete' ||
      (ingredientCountByFood.get(component.food_id) ?? 0) === 0
    );
  }).length;

  const normalisedIngredients = [...ingredientUnion].map((name) => ({
    original: name,
    key: name.toLowerCase(),
  }));
  const restrictedPresent = restrictedSubstances.filter((substance) => {
    const key = substance.trim().toLowerCase();
    return key && normalisedIngredients.some((ingredient) => ingredient.key.includes(key));
  });

  return {
    status: opaqueComponentCount > 0 ? 'unconfirmable' : 'confirmed',
    diet_period_id: period.id,
    component_count: period.components.length,
    opaque_component_count: opaqueComponentCount,
    ingredient_union: [...ingredientUnion].sort((a, b) => a.localeCompare(b)),
    restricted_ingredients_present: [...new Set(restrictedPresent)],
  };
}

export function periodComponentFoodIds(period: DogDietPeriod | null): string[] {
  if (!period) return [];
  return period.components
    .map((component: DogDietComponent) => component.food_id)
    .filter((id): id is string => Boolean(id));
}
