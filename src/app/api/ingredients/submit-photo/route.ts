import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { stripImageMetadata } from '@/lib/imageExif';
import { extractIngredientsFromImage, IngredientOcrError } from '@/lib/ingredientOcr';
import { uploadIngredientPhoto } from '@/lib/ingredientPhotoStorage';

// Node runtime (not edge) — needs Buffer/crypto and calls out to Supabase
// Storage + Anthropic's API, none of which are edge-safe assumptions here.
export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — Part B security requirement ("file size limit on uploads")
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * POST /api/ingredients/submit-photo — Part B `submitIngredientPhoto`.
 *
 * multipart/form-data body:
 *   - image: File (required)
 *   - dog_id: string (optional — which dog's profile this came from)
 *
 * Auth: same stopgap as the rest of the app (x-user-id header — see
 * src/lib/clientAuth.ts / BUILD_PROGRESS.md Phase 2 deviation #6). Required
 * here (not optional) because `ingredient_review_queue.submitted_by`
 * matters for the owner-facing submissions status page and for basic abuse
 * accountability on an upload endpoint.
 *
 * Flow: validate → strip EXIF/location metadata → upload to private
 * Storage → run Haiku vision OCR → write to `ingredient_review_queue` as
 * status='pending' (NEVER to `foods`/`food_ingredients` directly — Tier 2,
 * architecture doc §7). If OCR itself fails, the submission still lands in
 * the queue (flagged with `_ocr_error`) rather than being silently dropped
 * — the admin can review the photo manually.
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with an "image" file field' },
        { status: 400 }
      );
    }

    const file = formData.get('image');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '"image" file field is required' }, { status: 400 });
    }

    const dogIdRaw = formData.get('dog_id');
    const dogId = typeof dogIdRaw === 'string' && dogIdRaw.trim() ? dogIdRaw.trim() : null;

    if (dogId) {
      const { data: dog, error: dogError } = await supabaseAdmin
        .from('dogs')
        .select('id')
        .eq('id', dogId)
        .eq('owner_id', userId)
        .maybeSingle();
      if (dogError || !dog) {
        return NextResponse.json(
          { error: 'dog_id does not exist or does not belong to this user' },
          { status: 403 }
        );
      }
    }

    const mimeType = file.type;
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      return NextResponse.json(
        {
          error: `Unsupported image type "${mimeType || 'unknown'}". Allowed: ${Object.keys(
            ALLOWED_MIME_TYPES
          ).join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Image exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit` },
        { status: 413 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.length === 0) {
      return NextResponse.json({ error: 'Uploaded image is empty' }, { status: 400 });
    }
    // Re-check the real byte length (file.size can't always be trusted) before
    // doing any further work.
    if (rawBuffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Image exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit` },
        { status: 413 }
      );
    }

    // Privacy: strip EXIF/GPS metadata before the file is ever persisted to
    // storage (architecture doc §10). See src/lib/imageExif.ts for coverage
    // notes/limitations.
    const strippedBuffer = stripImageMetadata(rawBuffer, mimeType);

    const storagePath = `${userId}/${randomUUID()}.${extension}`;
    let storedPath: string;
    try {
      storedPath = await uploadIngredientPhoto(strippedBuffer, mimeType, storagePath);
    } catch (err) {
      console.error('submit-photo: storage upload failed', err);
      return NextResponse.json({ error: 'Failed to store the uploaded image' }, { status: 500 });
    }

    let ocrResult;
    let ocrError: string | undefined;
    try {
      ocrResult = await extractIngredientsFromImage(strippedBuffer, mimeType);
    } catch (err) {
      // Never lose the owner's submission because OCR failed — write the
      // queue row anyway, flagged, so an admin can review the photo by eye.
      ocrError =
        err instanceof IngredientOcrError
          ? err.message
          : `Unexpected OCR failure: ${err instanceof Error ? err.message : String(err)}`;
      console.error('submit-photo: OCR extraction failed', err);
      ocrResult = {
        brand: null,
        product_name: null,
        ingredients: [],
        age_suitability: null,
        weight_range: null,
        price: null,
        notes: null,
      };
    }

    const raw_ocr_json = {
      ...ocrResult,
      _image_storage_path: storedPath,
      ...(ocrError ? { _ocr_error: ocrError } : {}),
    };

    const { data: queueRow, error: insertError } = await supabaseAdmin
      .from('ingredient_review_queue')
      .insert({
        raw_ocr_json,
        submitted_by: userId,
        dog_id: dogId,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !queueRow) {
      console.error('submit-photo: failed to write review queue row', insertError);
      return NextResponse.json({ error: 'Failed to record the submission' }, { status: 500 });
    }

    return NextResponse.json(
      {
        queue_id: queueRow.id,
        status: queueRow.status,
        ocr_warning: ocrError
          ? 'Ingredient extraction failed for this photo — it has still been queued for manual review.'
          : undefined,
        extracted: ocrResult,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('submit-photo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
