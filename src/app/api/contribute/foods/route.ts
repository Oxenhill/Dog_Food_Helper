import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isContributorAuthorized, extractContributorToken } from '@/lib/contributorAuth';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import {
  validateContribution,
  MAX_FOODS_PER_SUBMISSION,
  MAX_FOODS_PER_HOUR,
} from '@/lib/contributedFoods';

/**
 * POST /api/contribute/foods — the contributor write path.
 *
 * Accepts a batch of new foods and STAGES them in `contributed_foods`. Nothing
 * reaches `foods` here; an admin approves first. See the migration for why this
 * path is the least trusted of the three that populate the catalogue.
 *
 * Two callers, one route:
 *   - the /contribute page, which posts `raw` — literally whatever the
 *     contributor pasted out of their chat session, prose and code fences and
 *     all. Tolerating that mess is the whole point: the contributors are
 *     non-technical, and "paste the reply" is the only instruction that
 *     survives contact with reality.
 *   - a direct API caller (curl, or an agent that can POST), which may post a
 *     structured `foods` array and a bearer token instead.
 *
 * Every food is reported on individually. A batch where three of ten foods are
 * malformed still stores the seven good ones — rejecting the batch would make a
 * contributor redo work they did correctly, and they cannot debug JSON.
 */

/** Guard on the pasted blob before any parsing work. */
const MAX_RAW_LENGTH = 400_000;

type Outcome =
  | { status: 'accepted'; brand: string; name: string; id: string; warning?: string }
  | { status: 'already_held'; brand: string; name: string }
  | { status: 'awaiting_review'; brand: string; name: string }
  | { status: 'rejected'; brand: string; name: string; reason: string };

/**
 * Pull a JSON payload out of arbitrary pasted text.
 *
 * Ordered most-precise first: a clean paste parses immediately, a fenced block
 * is the common case, and the brace-span fallback catches a paste that included
 * the assistant's surrounding commentary without fences.
 */
function extractJsonPayload(raw: string): { value: unknown } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: 'Nothing was pasted.' };

  const attempt = (candidate: string): unknown | undefined => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  const direct = attempt(text);
  if (direct !== undefined) return { value: direct };

  // ```json … ``` or plain ``` … ```, taking the LAST fenced block: if a chat
  // session showed an example or a corrected version, the final block is the
  // one it settled on.
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fences.reverse()) {
    const parsed = attempt(match[1].trim());
    if (parsed !== undefined) return { value: parsed };
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const parsed = attempt(text.slice(first, last + 1));
    if (parsed !== undefined) return { value: parsed };
  }

  return {
    error:
      'Could not find the data in what was pasted. Copy the whole json block from the assistant’s reply, including its opening { and closing }.',
  };
}

/** Accept `{ foods: [...] }`, `{ items: [...] }`, or a bare array. */
function extractFoodArray(payload: unknown): { value: unknown[] } | { error: string } {
  if (Array.isArray(payload)) return { value: payload };
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['foods', 'items', 'products']) {
      if (Array.isArray(obj[key])) return { value: obj[key] as unknown[] };
    }
    // A single food object pasted on its own.
    if (typeof obj.brand === 'string' && typeof obj.name === 'string') {
      return { value: [obj] };
    }
  }
  return { error: 'The pasted data has no list of foods in it.' };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // --- Access -------------------------------------------------------------
  const token = extractContributorToken(request, body.token);
  if (!isContributorAuthorized(token)) {
    // 404 rather than 401: an unconfigured or wrong-token request should not
    // confirm that a contribution endpoint exists here at all.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contributorLabel =
    typeof body.contributor === 'string' && body.contributor.trim()
      ? body.contributor.trim().slice(0, 120)
      : null;

  // --- Get to an array of candidate foods ---------------------------------
  let candidates: unknown[];
  if (Array.isArray(body.foods)) {
    candidates = body.foods;
  } else if (typeof body.raw === 'string') {
    if (body.raw.length > MAX_RAW_LENGTH) {
      return NextResponse.json(
        { error: 'That is much larger than a normal batch. Submit fewer foods at a time.' },
        { status: 400 }
      );
    }
    const payload = extractJsonPayload(body.raw);
    if ('error' in payload) return NextResponse.json({ error: payload.error }, { status: 400 });
    const arr = extractFoodArray(payload.value);
    if ('error' in arr) return NextResponse.json({ error: arr.error }, { status: 400 });
    candidates = arr.value;
  } else {
    return NextResponse.json({ error: 'Nothing was submitted.' }, { status: 400 });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'The list of foods is empty.' }, { status: 400 });
  }
  if (candidates.length > MAX_FOODS_PER_SUBMISSION) {
    return NextResponse.json(
      {
        error: `That batch has ${candidates.length} foods; the limit is ${MAX_FOODS_PER_SUBMISSION} at a time. Submit it in smaller batches.`,
      },
      { status: 400 }
    );
  }

  // --- Rate limit ---------------------------------------------------------
  // Counted in the database rather than in memory: serverless instances do not
  // share memory, so an in-process counter would be trivially bypassed and
  // would also reset on every cold start. One shared token means this is
  // effectively a global cap, which is the intent — it bounds how much review
  // work can be queued up in an hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await supabaseAdmin
    .from('contributed_foods')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  if (countError) {
    return NextResponse.json({ error: 'Could not accept the submission just now.' }, { status: 500 });
  }
  if ((recentCount ?? 0) + candidates.length > MAX_FOODS_PER_HOUR) {
    return NextResponse.json(
      {
        error: `A lot has been submitted in the last hour (${recentCount}). Please try again later — nothing is lost, the queue just needs to catch up.`,
      },
      { status: 429 }
    );
  }

  // --- Process ------------------------------------------------------------
  const outcomes: Outcome[] = [];
  // Guards against a single batch containing the same product twice, which the
  // database index would only catch one row at a time.
  const seenInBatch = new Set<string>();

  for (const candidate of candidates) {
    const validated = validateContribution(candidate);

    if (!validated.ok) {
      const asObj = (candidate ?? {}) as Record<string, unknown>;
      outcomes.push({
        status: 'rejected',
        brand: typeof asObj.brand === 'string' ? asObj.brand : 'Unnamed',
        name: typeof asObj.name === 'string' ? asObj.name : 'Unnamed product',
        reason: validated.error,
      });
      continue;
    }

    const food = validated.value;
    const key = `${food.brand.toLowerCase()}|${food.name.toLowerCase()}`;

    if (seenInBatch.has(key)) {
      outcomes.push({ status: 'awaiting_review', brand: food.brand, name: food.name });
      continue;
    }
    seenInBatch.add(key);

    const existing = await findDuplicateFood(food.brand, food.name);
    if (existing) {
      outcomes.push({ status: 'already_held', brand: food.brand, name: food.name });
      continue;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('contributed_foods')
      .insert({
        brand: food.brand,
        name: food.name,
        source_url: food.source_url,
        contributor_label: contributorLabel,
        payload: food,
      })
      .select('id')
      .single();

    if (insertError) {
      // 23505 = the unique partial index on pending (brand, name): somebody
      // else already submitted this product and it has not been reviewed yet.
      if (insertError.code === '23505') {
        outcomes.push({ status: 'awaiting_review', brand: food.brand, name: food.name });
        continue;
      }
      outcomes.push({
        status: 'rejected',
        brand: food.brand,
        name: food.name,
        reason: 'Could not be saved. Try submitting this one again.',
      });
      continue;
    }

    outcomes.push({
      status: 'accepted',
      brand: food.brand,
      name: food.name,
      id: (inserted as { id: string }).id,
      // Passed validation but some ingredient names were not found in the
      // pasted label text. Worth telling the contributor, since they may spot
      // a copy error before a reviewer has to.
      warning:
        food.unsupported_ingredient_names.length > 0
          ? `Not found in the label text you pasted: ${food.unsupported_ingredient_names.slice(0, 5).join(', ')}`
          : undefined,
    });
  }

  const accepted = outcomes.filter((o) => o.status === 'accepted').length;

  return NextResponse.json(
    {
      accepted,
      already_held: outcomes.filter((o) => o.status === 'already_held').length,
      awaiting_review: outcomes.filter((o) => o.status === 'awaiting_review').length,
      rejected: outcomes.filter((o) => o.status === 'rejected').length,
      results: outcomes,
    },
    { status: 200 }
  );
}
