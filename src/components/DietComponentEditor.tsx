'use client';

import FoodPicker, { PickableFood } from './FoodPicker';
import {
  DietComponentInput,
  DietComponentRole,
  DietComponentSchedule,
  DietComponentShare,
  DietMealSlot,
} from '@/lib/types';

export interface DietComponentDraft extends DietComponentInput {
  client_id: string;
  food?: PickableFood | null;
}

const ROLE_OPTIONS: { value: DietComponentRole; label: string }[] = [
  { value: 'topper', label: 'Topper' },
  { value: 'mixer', label: 'Mixer' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'treat', label: 'Treat' },
];

const SHARE_OPTIONS: { value: DietComponentShare; label: string }[] = [
  { value: 'most', label: 'Most of the meal' },
  { value: 'about_half', label: 'About half' },
  { value: 'small_amount', label: 'A small amount' },
  { value: 'spoonful', label: 'A spoonful' },
];

const SCHEDULE_OPTIONS: { value: DietComponentSchedule; label: string }[] = [
  { value: 'every_meal', label: 'Every meal' },
  { value: 'daily', label: 'Daily' },
  { value: 'specific_days', label: 'Specific days' },
  { value: 'rotating', label: 'Rotating' },
  { value: 'occasional', label: 'Occasional' },
];

const MEAL_OPTIONS: { value: DietMealSlot; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'any', label: 'Any meal' },
];

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

function componentName(component: DietComponentDraft): string {
  if (component.food) return `${component.food.brand} ${component.food.name}`;
  return component.food_freetext ?? 'Unnamed food';
}

function newClientId(): string {
  return `diet-component-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DietComponentEditor({
  value,
  onChange,
  dogId,
}: {
  value: DietComponentDraft[];
  onChange: (components: DietComponentDraft[]) => void;
  dogId?: string;
}) {
  function addFood(food: PickableFood) {
    if (value.some((component) => component.food_id === food.id)) return;
    onChange([
      ...value,
      {
        client_id: newClientId(),
        food_id: food.id,
        food_freetext: null,
        food,
      },
    ]);
  }

  function addFreetext(text: string) {
    const trimmed = text.trim();
    if (
      !trimmed ||
      value.some(
        (component) => component.food_freetext?.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      return;
    }
    onChange([
      ...value,
      {
        client_id: newClientId(),
        food_id: null,
        food_freetext: trimmed,
        food: null,
      },
    ]);
  }

  function update(clientId: string, patch: Partial<DietComponentDraft>) {
    onChange(
      value.map((component) =>
        component.client_id === clientId ? { ...component, ...patch } : component
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((component) => (
            <li key={component.client_id} className="card card-pad">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{componentName(component)}</p>
                  {!component.food_id && (
                    <p className="help-text">Name only — composition remains unconfirmable.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange(value.filter((item) => item.client_id !== component.client_id))
                  }
                  className="btn-ghost btn-sm"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="field">
                  <span className="label">Description (optional)</span>
                  <select
                    className="select"
                    value={component.role ?? ''}
                    onChange={(event) =>
                      update(component.client_id, {
                        role: (event.target.value || null) as DietComponentRole | null,
                      })
                    }
                  >
                    <option value="">Just a food</option>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="label">Amount (optional)</span>
                  <select
                    className="select"
                    value={component.share ?? ''}
                    onChange={(event) =>
                      update(component.client_id, {
                        share: (event.target.value || null) as DietComponentShare | null,
                      })
                    }
                  >
                    <option value="">Not recorded</option>
                    {SHARE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="label">Schedule (optional)</span>
                  <select
                    className="select"
                    value={component.schedule ?? ''}
                    onChange={(event) => {
                      const schedule = (event.target.value || null) as DietComponentSchedule | null;
                      update(component.client_id, {
                        schedule,
                        days_of_week: schedule === 'specific_days' ? [] : null,
                      });
                    }}
                  >
                    <option value="">Not recorded</option>
                    {SCHEDULE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="label">Meal (optional)</span>
                  <select
                    className="select"
                    value={component.meal_slot ?? ''}
                    onChange={(event) =>
                      update(component.client_id, {
                        meal_slot: (event.target.value || null) as DietMealSlot | null,
                      })
                    }
                  >
                    <option value="">Not recorded</option>
                    {MEAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {component.schedule === 'specific_days' && (
                <fieldset className="mt-3">
                  <legend className="label">Days</legend>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const checked = component.days_of_week?.includes(day.value) ?? false;
                      return (
                        <label key={day.value} className="flex items-center gap-1 text-[13px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const current = component.days_of_week ?? [];
                              update(component.client_id, {
                                days_of_week: event.target.checked
                                  ? [...current, day.value].sort((a, b) => a - b)
                                  : current.filter((value) => value !== day.value),
                              });
                            }}
                          />
                          {day.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <p className="label">{value.length > 0 ? 'Add another food' : 'Add a food'}</p>
        <FoodPicker
          type="meal"
          dogId={dogId}
          onSelect={addFood}
          onSelectFreetext={addFreetext}
        />
      </div>

      <p className="help-text">
        Every component counts equally for ingredient exposure. Description and amount help explain
        the pattern but never make one food primary.
      </p>
    </div>
  );
}
