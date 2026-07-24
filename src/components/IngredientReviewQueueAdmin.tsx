'use client';

import { useEffect, useState } from 'react';
import { adminAuthHeaders, getAdminToken, setAdminToken } from '@/lib/adminAuth';
import { IngredientReviewQueueItem, FoodType, Food } from '@/lib/types';

const FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];
const SIZE_CATEGORIES = ['toy', 'small', 'medium', 'large', 'giant'] as const;

type QueueItemWithDuplicate = IngredientReviewQueueItem & { possible_duplicate?: Food | null };

interface CorrectionState {
  brand: string;
  name: string;
  food_type: FoodType | '';
  suitable_age_min_months: string;
  suitable_age_max_months: string;
  suitable_size_min: string;
  suitable_size_max: string;
  price_per_kg: string;
  calories_per_kg: string;
  ingredients: string; // comma-separated in the form, split on submit
}

function initialCorrections(item: QueueItemWithDuplicate): CorrectionState {
  return {
    brand: item.raw_ocr_json.brand ?? '',
    name: item.raw_ocr_json.product_name ?? '',
    food_type: '',
    suitable_age_min_months: '',
    suitable_age_max_months: '',
    suitable_size_min: '',
    suitable_size_max: '',
    price_per_kg: '',
    calories_per_kg: '',
    ingredients: (item.raw_ocr_json.ingredients ?? []).join(', '),
  };
}

/**
 * Admin review-queue page (Phase 5, Part B item 2). Lists pending
 * `ingredient_review_queue` items, shows the OCR extraction (+ a possible-
 * duplicate warning computed server-side), and lets the reviewer Approve
 * (with corrections — the OCR JSON's free-text fields don't map onto
 * `foods`' strict columns, see /api/ingredients/review's header comment) or
 * Reject (with optional feedback).
 *
 * Gated by the same x-admin-token stopgap as the rest of Phase 4/5's admin
 * endpoints — not real admin auth. The token is entered once and kept in
 * localStorage (src/lib/adminAuth.ts), never hardcoded into this file.
 */
export default function IngredientReviewQueueAdmin() {
  const [tokenInput, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [items, setItems] = useState<QueueItemWithDuplicate[]>([]);
  const [corrections, setCorrections] = useState<Record<string, CorrectionState>>({});
  const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHasToken(!!getAdminToken());
  }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch('/api/ingredients/review-queue?status=pending', {
        headers: adminAuthHeaders(),
      });
      if (!res.ok) {
        setStatusMsg({ _global: `Failed to load queue (${res.status})` });
        return;
      }
      const json = await res.json();
      const queueItems: QueueItemWithDuplicate[] = json.items ?? [];
      setItems(queueItems);
      const initial: Record<string, CorrectionState> = {};
      for (const item of queueItems) initial[item.id] = initialCorrections(item);
      setCorrections(initial);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken) void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  function saveToken() {
    setAdminToken(tokenInput.trim());
    setHasToken(true);
  }

  function updateCorrection(id: string, field: keyof CorrectionState, value: string) {
    setCorrections((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function viewPhoto(item: QueueItemWithDuplicate) {
    const path = item.raw_ocr_json._image_storage_path;
    if (!path) return;
    const res = await fetch(`/api/ingredients/photo-url?path=${encodeURIComponent(path)}`, {
      headers: adminAuthHeaders(),
    });
    if (!res.ok) return;
    const json = await res.json();
    setPhotoUrls((prev) => ({ ...prev, [item.id]: json.url }));
  }

  async function approve(item: QueueItemWithDuplicate, confirmDuplicate = false) {
    const c = corrections[item.id];
    const body: Record<string, unknown> = {
      queue_id: item.id,
      decision: 'approve',
      corrections: {
        brand: c.brand || undefined,
        name: c.name || undefined,
        food_type: c.food_type || undefined,
        suitable_age_min_months: c.suitable_age_min_months ? Number(c.suitable_age_min_months) : null,
        suitable_age_max_months: c.suitable_age_max_months ? Number(c.suitable_age_max_months) : null,
        suitable_size_min: c.suitable_size_min || null,
        suitable_size_max: c.suitable_size_max || null,
        price_per_kg: c.price_per_kg ? Number(c.price_per_kg) : null,
        calories_per_kg: c.calories_per_kg ? Number(c.calories_per_kg) : null,
        ingredients: c.ingredients
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      confirm_create_despite_duplicate: confirmDuplicate,
    };

    const res = await fetch('/api/ingredients/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (res.status === 409 && json.duplicate_found) {
      setDuplicateConfirm((prev) => ({ ...prev, [item.id]: true }));
      setStatusMsg((prev) => ({
        ...prev,
        [item.id]: `Possible duplicate: "${json.existing_food.brand} ${json.existing_food.name}". Click Approve again to confirm this is a different product, or use Link to existing.`,
      }));
      return;
    }

    if (!res.ok) {
      setStatusMsg((prev) => ({ ...prev, [item.id]: `Error: ${json.error ?? res.status}` }));
      return;
    }

    setStatusMsg((prev) => ({ ...prev, [item.id]: `Approved → food ${json.resulting_food_id}` }));
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function linkToExisting(item: QueueItemWithDuplicate) {
    if (!item.possible_duplicate) return;
    const res = await fetch('/api/ingredients/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({
        queue_id: item.id,
        decision: 'approve',
        link_to_existing_food_id: item.possible_duplicate.id,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatusMsg((prev) => ({ ...prev, [item.id]: `Error: ${json.error ?? res.status}` }));
      return;
    }
    setStatusMsg((prev) => ({ ...prev, [item.id]: `Linked to existing food ${json.resulting_food_id}` }));
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function reject(item: QueueItemWithDuplicate) {
    const feedback = window.prompt('Optional feedback for this rejection:') ?? undefined;
    const res = await fetch('/api/ingredients/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
      body: JSON.stringify({ queue_id: item.id, decision: 'reject', feedback }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatusMsg((prev) => ({ ...prev, [item.id]: `Error: ${json.error ?? res.status}` }));
      return;
    }
    setStatusMsg((prev) => ({ ...prev, [item.id]: 'Rejected' }));
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  if (!hasToken) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-bold">Ingredient review queue — admin</h1>
        <p className="text-sm text-gray-600">
          Enter the admin token (RESEARCH_INGEST_ADMIN_TOKEN) to continue. This is a shared-secret
          stopgap, not real admin auth — see BUILD_PROGRESS.md.
        </p>
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          placeholder="Admin token"
        />
        <button
          type="button"
          onClick={saveToken}
          className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ingredient review queue — pending ({items.length})</h1>
        <button type="button" onClick={() => void loadQueue()} className="text-sm underline">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {statusMsg._global && <p className="text-red-600 text-sm">{statusMsg._global}</p>}

      {items.length === 0 && !loading && <p className="text-gray-500 text-sm">Nothing pending.</p>}

      {items.map((item) => {
        const c = corrections[item.id];
        if (!c) return null;
        const showDuplicateConfirm = duplicateConfirm[item.id];
        return (
          <div key={item.id} className="border border-gray-300 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>queue_id: {item.id}</span>
              <span>submitted: {new Date(item.created_at).toLocaleString()}</span>
            </div>

            {item.raw_ocr_json._ocr_error && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded p-2">
                OCR extraction failed for this photo — review manually: {item.raw_ocr_json._ocr_error}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 text-sm">
                <div><span className="font-medium">Extracted brand:</span> {item.raw_ocr_json.brand ?? '—'}</div>
                <div><span className="font-medium">Extracted product:</span> {item.raw_ocr_json.product_name ?? '—'}</div>
                <div><span className="font-medium">Age suitability:</span> {item.raw_ocr_json.age_suitability ?? '—'}</div>
                <div><span className="font-medium">Weight range:</span> {item.raw_ocr_json.weight_range ?? '—'}</div>
                <div><span className="font-medium">Price:</span> {item.raw_ocr_json.price ?? '—'}</div>
                <div><span className="font-medium">Notes:</span> {item.raw_ocr_json.notes ?? '—'}</div>
                <div><span className="font-medium">Ingredients:</span> {(item.raw_ocr_json.ingredients ?? []).join(', ') || '—'}</div>

                {item.raw_ocr_json._image_storage_path && (
                  <div>
                    <button type="button" onClick={() => void viewPhoto(item)} className="text-blue-600 underline">
                      View photo
                    </button>
                    {photoUrls[item.id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrls[item.id]} alt="submitted packet" className="mt-2 max-h-64 rounded" />
                    )}
                  </div>
                )}

                {item.possible_duplicate && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded p-2">
                    Possible duplicate: {item.possible_duplicate.brand} {item.possible_duplicate.name}
                    <button
                      type="button"
                      onClick={() => void linkToExisting(item)}
                      className="ml-2 text-blue-600 underline"
                    >
                      Link to existing instead
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-xs text-gray-500">
                  Fields below map to the strict `foods` schema — OCR can&apos;t populate these reliably,
                  fill in before approving.
                </p>
                <input
                  placeholder="Brand"
                  value={c.brand}
                  onChange={(e) => updateCorrection(item.id, 'brand', e.target.value)}
                  className="w-full border rounded p-1.5"
                />
                <input
                  placeholder="Product name"
                  value={c.name}
                  onChange={(e) => updateCorrection(item.id, 'name', e.target.value)}
                  className="w-full border rounded p-1.5"
                />
                <select
                  value={c.food_type}
                  onChange={(e) => updateCorrection(item.id, 'food_type', e.target.value)}
                  className="w-full border rounded p-1.5"
                >
                  <option value="">food_type (required)…</option>
                  {FOOD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Min age (months)"
                    value={c.suitable_age_min_months}
                    onChange={(e) => updateCorrection(item.id, 'suitable_age_min_months', e.target.value)}
                    className="border rounded p-1.5"
                  />
                  <input
                    placeholder="Max age (months)"
                    value={c.suitable_age_max_months}
                    onChange={(e) => updateCorrection(item.id, 'suitable_age_max_months', e.target.value)}
                    className="border rounded p-1.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={c.suitable_size_min}
                    onChange={(e) => updateCorrection(item.id, 'suitable_size_min', e.target.value)}
                    className="border rounded p-1.5"
                  >
                    <option value="">size min…</option>
                    {SIZE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={c.suitable_size_max}
                    onChange={(e) => updateCorrection(item.id, 'suitable_size_max', e.target.value)}
                    className="border rounded p-1.5"
                  >
                    <option value="">size max…</option>
                    {SIZE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="price_per_kg"
                    value={c.price_per_kg}
                    onChange={(e) => updateCorrection(item.id, 'price_per_kg', e.target.value)}
                    className="border rounded p-1.5"
                  />
                  <input
                    placeholder="calories_per_kg"
                    value={c.calories_per_kg}
                    onChange={(e) => updateCorrection(item.id, 'calories_per_kg', e.target.value)}
                    className="border rounded p-1.5"
                  />
                </div>
                <textarea
                  placeholder="Ingredients (comma-separated, in packet order)"
                  value={c.ingredients}
                  onChange={(e) => updateCorrection(item.id, 'ingredients', e.target.value)}
                  className="w-full border rounded p-1.5"
                  rows={2}
                />
              </div>
            </div>

            {statusMsg[item.id] && <p className="text-sm text-gray-700">{statusMsg[item.id]}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void approve(item, showDuplicateConfirm)}
                className="bg-green-700 text-white rounded-lg px-4 py-2 text-sm"
              >
                {showDuplicateConfirm ? 'Confirm — create as new food' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => void reject(item)}
                className="bg-red-700 text-white rounded-lg px-4 py-2 text-sm"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
