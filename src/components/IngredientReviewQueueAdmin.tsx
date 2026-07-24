'use client';

import { useEffect, useState } from 'react';
import { adminAuthHeaders, clearAdminToken, getAdminToken } from '@/lib/adminAuth';
import { saveSession } from '@/lib/session';
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
 * Gated by a real Supabase sign-in + `user_profiles.is_admin` check
 * (src/lib/serverAdminAuth.ts) — replaces the old shared x-admin-token
 * stopgap. Signs in via the existing POST /api/auth/signin route and stores
 * the resulting session access token (src/lib/adminAuth.ts), sent as
 * `Authorization: Bearer <token>` on every admin request.
 */
export default function IngredientReviewQueueAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
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
      if (res.status === 401) {
        // Signed in, but not an admin (or the session expired) — don't leave
        // the page stuck showing an empty queue with no explanation.
        clearAdminToken();
        setHasToken(false);
        setSignInError('Signed in, but this account does not have admin access (or the session expired).');
        return;
      }
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

  async function signIn() {
    setSignInError('');
    setSigningIn(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSignInError(json.error ?? `Sign-in failed (${res.status})`);
        return;
      }
      const accessToken = json.session?.access_token;
      if (!accessToken) {
        setSignInError('Signed in, but no session token was returned — check your email confirmation status.');
        return;
      }
      saveSession(json.session);
      setHasToken(true);
    } finally {
      setSigningIn(false);
    }
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
      <div className="mx-auto max-w-md">
        <p className="eyebrow">Admin sign in</p>
        <h1 className="page-title mt-2">Ingredient review queue</h1>
        <p className="lead mt-2">
          Sign in with your Dog Food Helper account. Access is only granted if your account has
          admin status (user_profiles.is_admin) — see BUILD_PROGRESS.md for how to become the
          first admin.
        </p>

        <div className="card card-pad mt-6">
          {signInError && (
            <div className="callout-alarm mb-4" role="alert">
              {signInError}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="review-queue-admin-email">
                Email
              </label>
              <input
                id="review-queue-admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="review-queue-admin-password">
                Password
              </label>
              <input
                id="review-queue-admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={signingIn}
              className="btn-primary btn-block"
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="page-title mt-1 text-[24px] sm:text-[26px]">
            Review queue <span className="metric text-ink-soft">({items.length} pending)</span>
          </h1>
        </div>
        <button type="button" onClick={() => void loadQueue()} className="btn-secondary btn-sm shrink-0">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {statusMsg._global && (
        <div className="callout-alarm" role="alert">
          {statusMsg._global}
        </div>
      )}

      {items.length === 0 && !loading && <p className="muted text-[14px]">Nothing pending.</p>}

      {items.map((item) => {
        const c = corrections[item.id];
        if (!c) return null;
        const showDuplicateConfirm = duplicateConfirm[item.id];
        return (
          <div key={item.id} className="card card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="metric text-[12px] text-ink-soft">queue_id: {item.id}</span>
              <span className="metric text-[12px] text-ink-soft">
                submitted: {new Date(item.created_at).toLocaleString()}
              </span>
            </div>

            {item.raw_ocr_json._ocr_error && (
              <div className="callout-info mt-3">
                OCR extraction failed for this photo — review manually: {item.raw_ocr_json._ocr_error}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-1.5 text-[14px]">
                <div>
                  <span className="font-semibold text-ink">Extracted brand:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.brand ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Extracted product:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.product_name ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Age suitability:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.age_suitability ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Weight range:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.weight_range ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Price:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.price ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Notes:</span>{' '}
                  <span className="text-ink-soft">{item.raw_ocr_json.notes ?? '—'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">Ingredients:</span>{' '}
                  <span className="text-ink-soft">
                    {(item.raw_ocr_json.ingredients ?? []).join(', ') || '—'}
                  </span>
                </div>

                {item.raw_ocr_json._image_storage_path && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => void viewPhoto(item)}
                      className="text-[13px] font-semibold text-pine hover:underline"
                    >
                      View photo
                    </button>
                    {photoUrls[item.id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrls[item.id]}
                        alt="submitted packet"
                        className="mt-2 max-h-64 max-w-full rounded-lg border border-line object-contain"
                      />
                    )}
                  </div>
                )}

                {item.possible_duplicate && (
                  <div className="callout-info mt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="signal-worse">possible duplicate</span>
                      <span>
                        {item.possible_duplicate.brand} {item.possible_duplicate.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void linkToExisting(item)}
                      className="mt-1.5 text-[13px] font-semibold text-pine hover:underline"
                    >
                      Link to existing instead
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <p className="help-text">
                  Fields below map to the strict `foods` schema — OCR can&apos;t populate these
                  reliably, fill in before approving.
                </p>
                <div className="field">
                  <label className="label" htmlFor={`brand-${item.id}`}>
                    Brand
                  </label>
                  <input
                    id={`brand-${item.id}`}
                    value={c.brand}
                    onChange={(e) => updateCorrection(item.id, 'brand', e.target.value)}
                    className="input"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`name-${item.id}`}>
                    Product name
                  </label>
                  <input
                    id={`name-${item.id}`}
                    value={c.name}
                    onChange={(e) => updateCorrection(item.id, 'name', e.target.value)}
                    className="input"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`food-type-${item.id}`}>
                    Food type
                  </label>
                  <select
                    id={`food-type-${item.id}`}
                    value={c.food_type}
                    onChange={(e) => updateCorrection(item.id, 'food_type', e.target.value)}
                    className="select"
                  >
                    <option value="">food_type (required)…</option>
                    {FOOD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field">
                    <label className="label" htmlFor={`age-min-${item.id}`}>
                      Min age (months)
                    </label>
                    <input
                      id={`age-min-${item.id}`}
                      value={c.suitable_age_min_months}
                      onChange={(e) => updateCorrection(item.id, 'suitable_age_min_months', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`age-max-${item.id}`}>
                      Max age (months)
                    </label>
                    <input
                      id={`age-max-${item.id}`}
                      value={c.suitable_age_max_months}
                      onChange={(e) => updateCorrection(item.id, 'suitable_age_max_months', e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field">
                    <label className="label" htmlFor={`size-min-${item.id}`}>
                      Size min
                    </label>
                    <select
                      id={`size-min-${item.id}`}
                      value={c.suitable_size_min}
                      onChange={(e) => updateCorrection(item.id, 'suitable_size_min', e.target.value)}
                      className="select"
                    >
                      <option value="">size min…</option>
                      {SIZE_CATEGORIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`size-max-${item.id}`}>
                      Size max
                    </label>
                    <select
                      id={`size-max-${item.id}`}
                      value={c.suitable_size_max}
                      onChange={(e) => updateCorrection(item.id, 'suitable_size_max', e.target.value)}
                      className="select"
                    >
                      <option value="">size max…</option>
                      {SIZE_CATEGORIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="field">
                    <label className="label" htmlFor={`price-${item.id}`}>
                      Price per kg
                    </label>
                    <input
                      id={`price-${item.id}`}
                      value={c.price_per_kg}
                      onChange={(e) => updateCorrection(item.id, 'price_per_kg', e.target.value)}
                      className="input metric"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`calories-${item.id}`}>
                      Calories per kg
                    </label>
                    <input
                      id={`calories-${item.id}`}
                      value={c.calories_per_kg}
                      onChange={(e) => updateCorrection(item.id, 'calories_per_kg', e.target.value)}
                      className="input metric"
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor={`ingredients-${item.id}`}>
                    Ingredients (comma-separated, in packet order)
                  </label>
                  <textarea
                    id={`ingredients-${item.id}`}
                    value={c.ingredients}
                    onChange={(e) => updateCorrection(item.id, 'ingredients', e.target.value)}
                    className="textarea"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {statusMsg[item.id] && <p className="muted mt-3 text-[14px]">{statusMsg[item.id]}</p>}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => void approve(item, showDuplicateConfirm)}
                className="btn-primary btn-sm"
              >
                {showDuplicateConfirm ? 'Confirm — create as new food' : 'Approve'}
              </button>
              <button type="button" onClick={() => void reject(item)} className="btn-danger btn-sm">
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
