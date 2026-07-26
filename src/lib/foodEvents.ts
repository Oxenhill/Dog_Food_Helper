import { supabaseAdmin } from './supabase';
import { DogFoodEvent } from './types';

/**
 * Food attribution — the shared write path for `dog_food_events`.
 *
 * Every log entry needs to be tied to what the dog was actually eating, or
 * nothing downstream works: `dog_log_entries.food_id_active` comes from the
 * main_food event open on the log date, and the correlation engine filters on
 * it. Before this existed, `dog_food_events` had never had a row, so the whole
 * chain was inert.
 *
 * This module is the single place events are opened and closed, so the
 * "exactly one open main_food event per dog" invariant is maintained in one
 * place rather than reimplemented per route. The database enforces it too
 * (unique partial index `dog_food_events_one_open_main_food`) — belt and
 * braces, because an ambiguous "what was it eating on that date" would
 * silently corrupt every attribution built on top of it.
 */

/**
 * Default number of days a food switch is treated as still in transition.
 *
 * Matches the digestive value seeded in `metric_minimum_lag_days`
 * (stool_score / stool_odor / gas_frequency / gas_odor = 10). Logs inside the
 * transition are confounded by BOTH foods — a phased switch means the dog is
 * literally eating a mixture — so they are not clean evidence for the new
 * food and the switch analysis skips them.
 */
export const DEFAULT_TRANSITION_DAYS = 10;

/** Owners usually phase a switch over about a week; cap the range sensibly. */
export const MAX_TRANSITION_DAYS = 60;

export interface StartMainFoodInput {
  dogId: string;
  foodId?: string | null;
  freetext?: string | null;
  /** ISO timestamp; defaults to now. */
  startedAt?: string | null;
  /** How long the switch is being phased over. Defaults to DEFAULT_TRANSITION_DAYS. */
  transitionDays?: number | null;
}

export interface StartMainFoodResult {
  event: DogFoodEvent;
  /** The event this switch closed, if the dog was already on a recorded food. */
  previousEvent: DogFoodEvent | null;
}

export async function getOpenMainFoodEvent(dogId: string): Promise<DogFoodEvent | null> {
  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .select('*')
    .eq('dog_id', dogId)
    .eq('event_type', 'main_food')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as DogFoodEvent | null) ?? null;
}

/**
 * Opens a main_food event, closing whatever the dog was on first.
 *
 * This is both "what is your dog eating now?" (no previous event) and "I've
 * changed foods" (previous event closed at the same instant the new one
 * starts, so the periods abut with no gap and no overlap).
 *
 * Ordering is forced: the unique partial index rejects a second open
 * main_food event, so the old one must be closed before the new one is
 * inserted. That leaves a window where a failed insert would strand the dog
 * with no open event, so the close is compensated on failure — the same
 * rollback discipline /api/ingredients/confirm uses when its ingredient
 * insert fails.
 */
export async function startMainFoodEvent(input: StartMainFoodInput): Promise<StartMainFoodResult> {
  const { dogId, foodId, freetext } = input;

  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    throw new Error('started_at is not a valid date');
  }

  const requestedTransition = input.transitionDays;
  const transitionDays =
    requestedTransition === null || requestedTransition === undefined
      ? DEFAULT_TRANSITION_DAYS
      : Math.min(Math.max(Math.round(requestedTransition), 0), MAX_TRANSITION_DAYS);

  const previousEvent = await getOpenMainFoodEvent(dogId);

  // A switch to the same food is not a switch. Re-recording it would create a
  // spurious switch point with an empty differing set, which the analysis
  // would then have to special-case; better not to create it.
  if (
    previousEvent &&
    foodId &&
    previousEvent.food_or_treat_id &&
    previousEvent.food_or_treat_id === foodId
  ) {
    return { event: previousEvent, previousEvent: null };
  }

  if (previousEvent) {
    const { error: closeError } = await supabaseAdmin
      .from('dog_food_events')
      .update({ ended_at: startedAt.toISOString() })
      .eq('id', previousEvent.id);
    if (closeError) throw closeError;
  }

  // in_transition_until is computed server-side; the client never sets it.
  const inTransitionUntil =
    transitionDays > 0
      ? new Date(startedAt.getTime() + transitionDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data: event, error: insertError } = await supabaseAdmin
    .from('dog_food_events')
    .insert({
      dog_id: dogId,
      food_or_treat_id: foodId ?? null,
      food_or_treat_freetext: freetext ?? null,
      event_type: 'main_food',
      started_at: startedAt.toISOString(),
      in_transition_until: inTransitionUntil,
    })
    .select()
    .single();

  if (insertError || !event) {
    // Compensate: put the previous event back rather than leaving the dog with
    // no open food event at all.
    if (previousEvent) {
      const { error: reopenError } = await supabaseAdmin
        .from('dog_food_events')
        .update({ ended_at: previousEvent.ended_at ?? null })
        .eq('id', previousEvent.id);
      if (reopenError) {
        console.error(
          `startMainFoodEvent: insert failed AND reopening event ${previousEvent.id} failed — dog ${dogId} has no open main_food event`,
          reopenError
        );
      }
    }
    throw insertError ?? new Error('Failed to open food event');
  }

  // `dogs.current_food_*` stays in step because the baseline anchor
  // (baselines/establish) and the recommendation profile both read it. It is a
  // convenience pointer to "now"; the event history is the source of truth for
  // what was true on any given past date.
  const { error: dogUpdateError } = await supabaseAdmin
    .from('dogs')
    .update({
      current_food_id: foodId ?? null,
      current_food_freetext: freetext ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dogId);

  if (dogUpdateError) {
    // Non-fatal: the event (the thing attribution depends on) is recorded.
    console.error(`startMainFoodEvent: dog ${dogId} pointer update failed`, dogUpdateError);
  }

  return { event: event as DogFoodEvent, previousEvent };
}

export interface LogTreatInput {
  dogId: string;
  foodId?: string | null;
  freetext?: string | null;
  /** ISO timestamp of the occasion; defaults to now. */
  occurredAt?: string | null;
}

/**
 * Records a treat as a discrete occasion.
 *
 * Treats are unlike the cadence of daily foods, so a treat is NOT modelled as
 * a food period with a start and an end. It is one event on one date:
 * `started_at` is the occasion, `ended_at` stays null, and
 * `in_transition_until` is meaningless and therefore null.
 *
 * Note this never touches `dogs.current_food_*` — a treat is not what the dog
 * is being fed.
 */
export async function logTreatEvent(input: LogTreatInput): Promise<DogFoodEvent> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('occurred_at is not a valid date');
  }

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

/** Closes an open event explicitly (e.g. "we stopped this food and haven't replaced it yet"). */
export async function endFoodEvent(
  dogId: string,
  eventId: string,
  endedAt?: string | null
): Promise<DogFoodEvent | null> {
  const when = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(when.getTime())) {
    throw new Error('ended_at is not a valid date');
  }

  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .update({ ended_at: when.toISOString() })
    .eq('id', eventId)
    .eq('dog_id', dogId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return (data as DogFoodEvent | null) ?? null;
}

export interface FoodEventWithFood extends DogFoodEvent {
  food: { id: string; brand: string; name: string; food_type: string; is_treat: boolean } | null;
}

/**
 * Main-food history (newest first) plus recent treat occasions, each joined to
 * its catalogue food where one was named.
 */
export async function listFoodEvents(
  dogId: string,
  treatLimit = 30
): Promise<{ mainFood: FoodEventWithFood[]; treats: FoodEventWithFood[] }> {
  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .select('*, food:foods!dog_food_events_food_or_treat_id_fkey(id, brand, name, food_type, is_treat)')
    .eq('dog_id', dogId)
    .order('started_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as FoodEventWithFood[];
  return {
    mainFood: rows.filter((r) => r.event_type === 'main_food'),
    treats: rows.filter((r) => r.event_type === 'treat').slice(0, treatLimit),
  };
}
