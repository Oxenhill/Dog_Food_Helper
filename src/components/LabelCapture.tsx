'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';

/**
 * Owner-facing packet capture: photograph the front and back, check what we
 * read, correct anything wrong, confirm.
 *
 * The owner verifies their own submission. They are holding the packet, so
 * they can check a transcription better than anyone reviewing it later — and
 * this removes the admin bottleneck that would otherwise sit between a client
 * photographing a food and that food being usable.
 *
 * The photos are never stored. They are sent for reading and discarded; the
 * text on this screen becomes the record.
 */

interface Extraction {
  brand: string | null;
  product_name: string | null;
  food_type: string;
  is_treat: boolean;
  ingredients: string[];
  protein_pct: number | null;
  fat_pct: number | null;
  fibre_pct: number | null;
  moisture_pct: number | null;
  ash_pct: number | null;
  phosphorus_pct: number | null;
  sodium_pct: number | null;
  calcium_pct: number | null;
  calories_per_kg: number | null;
  life_stage_text: string | null;
  pack_size_text: string | null;
  notes: string | null;
  unreadable: boolean;
}

interface ExistingFood {
  id: string;
  brand: string;
  name: string;
}

const FOOD_TYPES = [
  { value: 'kibble', label: 'Dry / kibble' },
  { value: 'wet', label: 'Wet / tinned' },
  { value: 'raw', label: 'Raw' },
  { value: 'cold_pressed', label: 'Cold pressed' },
  { value: 'cooked', label: 'Cooked / fresh' },
  { value: 'other', label: 'Other' },
];

const NUTRIENT_FIELDS: { key: keyof Extraction; label: string }[] = [
  { key: 'protein_pct', label: 'Protein' },
  { key: 'fat_pct', label: 'Fat / oils' },
  { key: 'fibre_pct', label: 'Crude fibre' },
  { key: 'moisture_pct', label: 'Moisture' },
  { key: 'ash_pct', label: 'Ash' },
  { key: 'phosphorus_pct', label: 'Phosphorus' },
  { key: 'sodium_pct', label: 'Sodium' },
  { key: 'calcium_pct', label: 'Calcium' },
];

type Step = 'capture' | 'review' | 'done';

export default function LabelCapture({ dogId }: { dogId?: string }) {
  const [step, setStep] = useState<Step>('capture');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState<Extraction | null>(null);
  const [existing, setExisting] = useState<ExistingFood | null>(null);
  const [ingredientText, setIngredientText] = useState('');
  const [result, setResult] = useState<{ outcome: string; message?: string; food_id: string } | null>(
    null
  );

  async function handleRead(e: React.FormEvent) {
    e.preventDefault();
    if (!front) {
      setError('A photo of the front of the packet is required.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('front', front);
      if (back) fd.append('back', back);

      const res = await fetch('/api/ingredients/extract', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Could not read the photos (${res.status})`);
        return;
      }
      const ex = json.extracted as Extraction;
      setDraft(ex);
      setExisting(json.existing_food ?? null);
      setIngredientText(ex.ingredients.join('\n'));
      setStep('review');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError('');
    setBusy(true);
    try {
      const ingredients = ingredientText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const res = await fetch('/api/ingredients/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          brand: draft.brand ?? '',
          name: draft.product_name ?? '',
          food_type: draft.food_type || 'other',
          is_treat: draft.is_treat,
          ingredients,
          calories_per_kg: draft.calories_per_kg,
          protein_pct: draft.protein_pct,
          fat_pct: draft.fat_pct,
          fibre_pct: draft.fibre_pct,
          moisture_pct: draft.moisture_pct,
          ash_pct: draft.ash_pct,
          phosphorus_pct: draft.phosphorus_pct,
          sodium_pct: draft.sodium_pct,
          calcium_pct: draft.calcium_pct,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Could not save (${res.status})`);
        return;
      }
      setResult(json);
      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof Extraction>(key: K, value: Extraction[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function numberOrNull(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  // ---- Done -------------------------------------------------------------
  if (step === 'done' && result) {
    return (
      <div className="card card-pad">
        <h2 className="section-title">
          {result.outcome === 'created' ? 'Saved — thank you' : 'Already on our list'}
        </h2>
        <p className="lead mt-2">
          {result.message ??
            'This food is now recorded, with the ingredients exactly as you confirmed them.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/foods/${result.food_id}${dogId ? `?dog=${dogId}` : ''}`} className="btn-primary">
            See the food
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setStep('capture');
              setFront(null);
              setBack(null);
              setDraft(null);
              setExisting(null);
              setResult(null);
            }}
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  // ---- Review -----------------------------------------------------------
  if (step === 'review' && draft) {
    const ingredientCount = ingredientText.split('\n').filter((l) => l.trim()).length;

    return (
      <form onSubmit={(e) => void handleConfirm(e)} className="flex flex-col gap-5">
        <div className="callout-info">
          <p className="font-semibold text-ink">Check this against the packet</p>
          <p className="mt-1">
            This is what we read from your photos. You&apos;re holding the packet, so please correct
            anything that&apos;s wrong before saving — especially the ingredients. Your photos
            haven&apos;t been kept; this text is what gets saved.
          </p>
        </div>

        {draft.unreadable && (
          <div className="callout-alarm" role="alert">
            The photos were hard to read, so a lot of this may be wrong. Consider going back and
            retaking them with the packet flat and well lit.
          </div>
        )}

        {draft.notes && <p className="help-text italic">Note from the reader: {draft.notes}</p>}

        {existing && (
          <div className="callout-disclaimer">
            We already have <strong>{existing.brand} {existing.name}</strong>. If you save this, it
            will be recorded alongside ours rather than replacing it, and we&apos;ll check which is
            current.
          </div>
        )}

        {error && (
          <div className="callout-alarm" role="alert">
            {error}
          </div>
        )}

        <div className="card card-pad flex flex-col gap-4">
          <h2 className="section-title">What is it?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="brand">Brand</label>
              <input
                id="brand"
                className="input"
                value={draft.brand ?? ''}
                onChange={(e) => update('brand', e.target.value)}
                placeholder="From the front of the packet"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="pname">Product name</label>
              <input
                id="pname"
                className="input"
                value={draft.product_name ?? ''}
                onChange={(e) => update('product_name', e.target.value)}
                placeholder="e.g. Adult Chicken &amp; Rice"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="ftype">Form</label>
              <select
                id="ftype"
                className="select"
                value={draft.food_type || 'other'}
                onChange={(e) => update('food_type', e.target.value)}
              >
                {FOOD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Is this a treat?</span>
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={draft.is_treat}
                  onChange={(e) => update('is_treat', e.target.checked)}
                />
                Treat, chew or topper (not a complete meal)
              </label>
              <p className="help-text">Treats are logged and tracked, but never suggested as a main food.</p>
            </div>
          </div>
          {(draft.life_stage_text || draft.pack_size_text) && (
            <p className="help-text">
              Also on the packet: {[draft.life_stage_text, draft.pack_size_text].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="card card-pad">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">Ingredients</h2>
            <span className="metric text-[13px] text-ink-soft">{ingredientCount} lines</span>
          </div>
          <p className="help-text mt-1">
            One per line, in the order printed on the packet. Keep any percentages and wording
            exactly as printed — this is what allergy checks are matched against.
          </p>
          <textarea
            className="textarea mt-3 min-h-[220px] font-mono text-[13px]"
            value={ingredientText}
            onChange={(e) => setIngredientText(e.target.value)}
            placeholder={'Chicken meal (26%)\nBrown rice\nBeet pulp'}
          />
        </div>

        <div className="card card-pad">
          <h2 className="section-title">Analytical constituents</h2>
          <p className="help-text mt-1">
            The percentages panel on the back. Leave anything blank that isn&apos;t printed — we&apos;d
            rather have a gap than a guess.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NUTRIENT_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label className="label" htmlFor={f.key}>{f.label} %</label>
                <input
                  id={f.key}
                  className="input metric"
                  inputMode="decimal"
                  value={(draft[f.key] as number | null) ?? ''}
                  onChange={(e) =>
                    update(f.key, numberOrNull(e.target.value) as Extraction[typeof f.key])
                  }
                />
              </div>
            ))}
            <div className="field">
              <label className="label" htmlFor="kcal">kcal / kg</label>
              <input
                id="kcal"
                className="input metric"
                inputMode="numeric"
                value={draft.calories_per_kg ?? ''}
                onChange={(e) => update('calories_per_kg', numberOrNull(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'This is correct — save it'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setStep('capture');
              setDraft(null);
              setExisting(null);
            }}
          >
            Retake photos
          </button>
        </div>
      </form>
    );
  }

  // ---- Capture ----------------------------------------------------------
  return (
    <form onSubmit={(e) => void handleRead(e)} className="flex flex-col gap-5">
      <div className="callout-info">
        <p className="font-semibold text-ink">Photograph both sides</p>
        <p className="mt-1">
          The <strong>front</strong> gives us the brand and product name. The <strong>back</strong>{' '}
          has the ingredients and the percentages panel — the part that actually matters for allergy
          checks. You&apos;ll get to check and correct everything before it&apos;s saved, and the
          photos aren&apos;t kept.
        </p>
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      <div className="card card-pad flex flex-col gap-4">
        <div className="field">
          <label className="label" htmlFor="front">Front of packet (required)</label>
          <input
            id="front"
            className="input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          />
          {front && <p className="help-text">{front.name}</p>}
        </div>

        <div className="field">
          <label className="label" htmlFor="back">Back of packet — ingredients panel</label>
          <input
            id="back"
            className="input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => setBack(e.target.files?.[0] ?? null)}
          />
          {back ? (
            <p className="help-text">{back.name}</p>
          ) : (
            <p className="help-text">
              Strongly recommended — without it we can&apos;t record the ingredients or the
              percentages.
            </p>
          )}
        </div>
      </div>

      <button type="submit" className="btn-primary btn-block" disabled={busy || !front}>
        {busy ? 'Reading the packet…' : 'Read the packet'}
      </button>
    </form>
  );
}
