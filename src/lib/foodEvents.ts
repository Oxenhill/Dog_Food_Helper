import { supabaseAdmin } from './supabase';
import { DogFoodEvent } from './types';

/**
 * dog_food_events now records discrete treat occasions. Historical main_food
 * rows remain as provenance; new diet state belongs to dog_diet_periods.
 */
export interface LogTreatInput {
  dogId: string;
  foodId?: string | null;
  freetext?: string | null;
  occurredAt?: string | null;
}

export async function logTreatEvent(input: LogTreatInput): Promise<DogFoodEvent> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error('occurred_at is not a valid date');

  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .insert({
      dog_id: input.dogId,
      food_or_treat_id: input.foodId ?? null,
      food_or_treat_freetext: input.freetext ?? null,
      event_type: 'treat',
      started_at: occurredAt.toISOString(),
      ended_at: null,
      in_transition_until: null,
    })
    .select()
    .single();

  if (error || !data) throw error ?? new Error('Failed to record treat');
  return data as DogFoodEvent;
}

export async function endFoodEvent(
  dogId: string,
  eventId: string,
  endedAt?: string | null
): Promise<DogFoodEvent | null> {
  const when = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('ended_at is not a valid date');

  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .update({ ended_at: when.toISOString() })
    .eq('id', eventId)
    .eq('dog_id', dogId)
    .eq('event_type', 'treat')
    .select()
    .maybeSingle();

  if (error) throw error;
  return (data as DogFoodEvent | null) ?? null;
}

export interface FoodEventWithFood extends DogFoodEvent {
  food: { id: string; brand: string; name: string; food_type: string; is_treat: boolean } | null;
}

export async function listTreatEvents(dogId: string, limit = 30): Promise<FoodEventWithFood[]> {
  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .select('*, food:foods!dog_food_events_food_or_treat_id_fkey(id, brand, name, food_type, is_treat)')
    .eq('dog_id', dogId)
    .eq('event_type', 'treat')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as FoodEventWithFood[];
}
