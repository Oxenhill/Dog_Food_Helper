'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sessionAuthHeaders } from '@/lib/session';
import { Food, FoodIngredient, FoodType, SizeCategory } from '@/lib/types';

const FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];
const SIZE_CATEGORIES: SizeCategory[] = ['toy', 'small', 'medium', 'large', 'giant'];

type NutrientField =
  | 'protein_pct'
  | 'fat_pct'
  | 'fibre_pct'
  | 'moisture_pct'
  | 'ash_pct'
  | 'phosphorus_pct'
  | 'sodium_pct'
  | 'calcium_pct';

const NUTRIENT_ROWS: { field: NutrientField; label: string }[] = [
  { field: 'protein_pct', label: 'Protein %' },
  { field: 'fat_pct', label: 'Fat %' },
  { field: 'fibre_pct', label: 'Fibre %' },
  { field: 'moisture_pct', label: 'Moisture %' },
  { field: 'ash_pct', label: 'Ash %' },
  { field: 'phosphorus_pct', label: 'Phosphorus %' },
  { field: 'sodium_pct', label: 'Sodium %' },
  { field: 'calcium_pct', label: 'Calcium %' },
];

interface FormState {
  brand: string;
  name: string;
  food_type: FoodType | '';
  source_url: string;
  price_per_kg: string;
  calories_per_kg: string;
  suitable_age_min_months: string;
  suitable_age_max_months: string;
  suitable_size_min: SizeCategory | '';
  suitable_size_max: SizeCategory | '';
  protein_pct: string;
  fat_pct: string;
  fibre_pct: string;
  moisture_pct: string;
  ash_pct: string;
  phosphorus_pct: string;
  sodium_pct: string;
  calcium_pct: string;
}

function toFieldString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function formFromFood(food: Food): FormState {
  return {
    brand: food.brand ?? '',
    name: food.name ?? '',
    food_type: food.food_type ?? '',
    source_url: food.source_url ?? '',
    price_per_kg: toFieldString(food.price_per_kg),
    calories_per_kg: toFieldString(food.calories_per_kg),
    suitable_age_min_months: toFieldString(food.suitable_age_min_months),
    suitable_age_max_months: toFieldString(food.suitable_age_max_months),
    suitable_size_min: food.suitable_size_min ?? '',
    suitable_size_max: food.suitable_size_max ?? '',
    protein_pct: toFieldString(food.protein_pct),
    fat_pct: toFieldString(food.fat_pct),
    fibre_pct: toFieldString(food.fibre_pct),
    moisture_pct: toFieldString(food.moisture_pct),
    ash_pct: toFieldString(food.ash_pct),
    phosphorus_pct: toFieldString(food.phosphorus_pct),
    sodium_pct: toFieldString(food.sodium_pct),
    calcium_pct: toFieldString(food.calcium_pct),
  };
}

const NUMERIC_KEYS: (keyof FormState)[] = [
  'price_per_kg',
  'calories_per_kg',
  'suitable_age_min_months',
  'suitable_age_max_months',
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
  'phosphorus_pct',
  'sodium_pct',
  'calcium_pct',
];

/**
 * Admin food detail/correction page (/admin/foods/[foodId]). Shows the food's
 * fields, its ordered ingredient list (provenance — what extraction actually
 * found), an 8-row nutrient table, and an edit form for correcting/filling in
 * values. This is a review/override surface: composition data primarily
 * arrives via automated extraction (a later workstream), not manual entry —
 * a blank field means "unknown", never "zero". Values are never invented
 * here; only what an admin explicitly types is saved.
 */
export default function FoodDetailAdmin({ foodId }: { foodId: string }) {
  const router = useRouter();
  const [food, setFood] = useState<Food | null>(null);
  const [ingredients, setIngredients] = useState<FoodIngredient[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/foods/${foodId}`, { headers: sessionAuthHeaders() });
      if (res.status === 404) {
        setLoadError('Food not found.');
        return;
      }
      if (!res.ok) {
        setLoadError(`Could not load this food (${res.status}).`);
        return;
      }
      const json = await res.json();
      setFood(json.food);
      setIngredients(json.ingredients ?? []);
      setForm(formFromFood(json.food));
    } catch {
      setLoadError('Could not load this food.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodId]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaveError('');
    setSaveMsg('');

    if (!form.brand.trim()) {
      setSaveError('Brand cannot be empty.');
      return;
    }
    if (!form.name.trim()) {
      setSaveError('Name cannot be empty.');
      return;
    }
    if (!form.food_type) {
      setSaveError('Food type is required.');
      return;
    }

    // Validate numeric fields client-side too, so a typo doesn't just bounce
    // silently off the server as a generic error.
    for (const key of NUMERIC_KEYS) {
      const raw = form[key];
      if (raw !== '' && Number.isNaN(Number(raw))) {
        setSaveError(`"${key}" must be a number, or left blank for unknown.`);
        return;
      }
    }

    const body: Record<string, unknown> = {
      brand: form.brand.trim(),
      name: form.name.trim(),
      food_type: form.food_type,
      source_url: form.source_url.trim() === '' ? null : form.source_url.trim(),
      suitable_size_min: form.suitable_size_min === '' ? null : form.suitable_size_min,
      suitable_size_max: form.suitable_size_max === '' ? null : form.suitable_size_max,
    };
    for (const key of NUMERIC_KEYS) {
      body[key] = form[key] === '' ? null : Number(form[key]);
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/foods/${foodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? `Save failed (${res.status}).`);
        return;
      }
      setFood(json.food);
      setForm(formFromFood(json.food));
      setSaveMsg('Saved.');
    } catch {
      setSaveError('Save failed — network error.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted text-[14px]">Loading…</p>;
  }

  if (loadError || !food || !form) {
    return (
      <div className="callout-alarm" role="alert">
        {loadError || 'Food not found.'}
      </div>
    );
  }

  const compositionIngredients = ingredients.filter((ingredient) => ingredient.position_in_list !== null);
  const additives = ingredients.filter((ingredient) => ingredient.additive_sequence != null);

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={() => router.push('/admin/foods')} className="btn-ghost btn-sm self-start">
        ← Back to food database
      </button>

      <div className="card card-pad">
        <p className="eyebrow">Food record</p>
        <h2 className="section-title mt-1">
          {food.brand} <span className="font-normal text-ink-soft">{food.name}</span>
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <span className="muted">
            Type: <span className="text-ink">{food.food_type}</span>
          </span>
          <span className="muted">
            Price:{' '}
            <span className="metric text-ink">
              {food.price_per_kg != null ? `£${Number(food.price_per_kg).toFixed(2)}/kg` : '—'}
            </span>
          </span>
          <span className="muted">
            Calories:{' '}
            <span className="metric text-ink">
              {food.calories_per_kg != null ? `${food.calories_per_kg} kcal/kg` : '—'}
            </span>
          </span>
          <span className="muted">
            Age range:{' '}
            <span className="metric text-ink">
              {food.suitable_age_min_months ?? '—'}–{food.suitable_age_max_months ?? '—'} mo
            </span>
          </span>
          <span className="muted">
            Size range:{' '}
            <span className="text-ink">
              {food.suitable_size_min ?? '—'}–{food.suitable_size_max ?? '—'}
            </span>
          </span>
        </div>
        {food.source_url && (
          <p className="mt-2 text-[13px]">
            <span className="muted">Source: </span>
            <a href={food.source_url} target="_blank" rel="noreferrer" className="text-pine hover:underline">
              {food.source_domain ?? food.source_url}
            </a>
          </p>
        )}
        {food.last_verified_at && (
          <p className="help-text mt-1">
            Last verified {new Date(food.last_verified_at).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <p className="section-title">Ingredients</p>
        <p className="help-text mt-1">Ordered as listed on the packet/source.</p>
        {compositionIngredients.length === 0 ? (
          <p className="muted mt-3 text-[14px]">No ingredient list recorded.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-1.5">
            {compositionIngredients.map((ing) => (
              <li key={ing.id} className="flex items-baseline gap-3 text-[14px]">
                <span className="metric w-6 shrink-0 text-ink-soft">{ing.position_in_list}.</span>
                <span className="text-ink">{ing.ingredient_name}</span>
                {ing.ingredient_category && (
                  <span className="badge-neutral">{ing.ingredient_category}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {additives.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="section-title">Additives</p>
            <p className="help-text mt-1">Separate label-panel order; not ingredient prevalence.</p>
            <ol className="mt-3 flex flex-col gap-1.5">
              {additives.map((additive) => (
                <li key={additive.id} className="flex items-baseline gap-3 text-[14px]">
                  <span className="metric w-6 shrink-0 text-ink-soft">{additive.additive_sequence}.</span>
                  <span className="text-ink">{additive.ingredient_name}</span>
                  {additive.note && <span className="text-ink-soft">{additive.note}</span>}
                  {additive.additive_category_printed && (
                    <span className="badge-neutral">{additive.additive_category_printed}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <p className="section-title">Nutrient composition (guaranteed analysis)</p>
        <div className="mt-3 overflow-hidden rounded border border-line">
          <table className="w-full text-[14px]">
            <tbody>
              {NUTRIENT_ROWS.map((row, i) => (
                <tr key={row.field} className={i > 0 ? 'hairline' : ''}>
                  <td className="px-3 py-2 text-ink-soft">{row.label}</td>
                  <td className="metric px-3 py-2 text-right text-ink">
                    {toFieldString(food[row.field] as number | null | undefined) === ''
                      ? '—'
                      : `${food[row.field]}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <p className="section-title">Correct or fill in values</p>
        <p className="help-text mt-1">
          This form is for review and correction. Composition data primarily arrives via
          automated extraction — a workstream that populates these fields ahead of publication.
          Leave a field blank to mark it unknown; never enter a value you&apos;re not sure of.
        </p>

        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="food-brand">
                Brand
              </label>
              <input
                id="food-brand"
                className="input"
                value={form.brand}
                onChange={(e) => updateField('brand', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="food-name">
                Name
              </label>
              <input
                id="food-name"
                className="input"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="food-type">
                Food type
              </label>
              <select
                id="food-type"
                className="select"
                value={form.food_type}
                onChange={(e) => updateField('food_type', e.target.value as FoodType)}
              >
                <option value="">Select…</option>
                {FOOD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="food-source-url">
                Source URL
              </label>
              <input
                id="food-source-url"
                className="input"
                value={form.source_url}
                onChange={(e) => updateField('source_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="food-price">
                Price per kg (£)
              </label>
              <input
                id="food-price"
                className="input metric"
                inputMode="decimal"
                value={form.price_per_kg}
                onChange={(e) => updateField('price_per_kg', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="food-calories">
                Calories per kg
              </label>
              <input
                id="food-calories"
                className="input metric"
                inputMode="decimal"
                value={form.calories_per_kg}
                onChange={(e) => updateField('calories_per_kg', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="food-age-min">
                Min suitable age (months)
              </label>
              <input
                id="food-age-min"
                className="input metric"
                inputMode="numeric"
                value={form.suitable_age_min_months}
                onChange={(e) => updateField('suitable_age_min_months', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="food-age-max">
                Max suitable age (months)
              </label>
              <input
                id="food-age-max"
                className="input metric"
                inputMode="numeric"
                value={form.suitable_age_max_months}
                onChange={(e) => updateField('suitable_age_max_months', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="food-size-min">
                Min suitable size
              </label>
              <select
                id="food-size-min"
                className="select"
                value={form.suitable_size_min}
                onChange={(e) => updateField('suitable_size_min', e.target.value as SizeCategory)}
              >
                <option value="">Unknown</option>
                {SIZE_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="food-size-max">
                Max suitable size
              </label>
              <select
                id="food-size-max"
                className="select"
                value={form.suitable_size_max}
                onChange={(e) => updateField('suitable_size_max', e.target.value as SizeCategory)}
              >
                <option value="">Unknown</option>
                {SIZE_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="hairline pt-4">
            <p className="label mb-3">Nutrient composition (%)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {NUTRIENT_ROWS.map((row) => (
                <div className="field" key={row.field}>
                  <label className="label" htmlFor={`food-${row.field}`}>
                    {row.label}
                  </label>
                  <input
                    id={`food-${row.field}`}
                    className="input metric"
                    inputMode="decimal"
                    value={form[row.field as keyof FormState] as string}
                    onChange={(e) => updateField(row.field as keyof FormState, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {saveError && (
            <div className="callout-alarm" role="alert">
              {saveError}
            </div>
          )}
          {saveMsg && <p className="text-[13px] font-medium text-pine">{saveMsg}</p>}

          <button type="submit" disabled={saving} className="btn-primary self-start">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
