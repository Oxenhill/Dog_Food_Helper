import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { stripImageMetadata } from '@/lib/imageExif';
import {
  extractFromLabelPhotos,
  hasGatewayAuth,
  LabelExtractionError,
  type LabelImage,
} from '@/lib/labelExtraction';
import { findDuplicateFood } from '@/lib/foodDuplicates';

// Node runtime — needs Buffer and calls out to the Gateway.
export const runtime = 'nodejs';
// A two-image vision extraction can run past the platform default (10s) —
// give it real headroom rather than racing a cold Gateway call.
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB per image
const MAX_IMAGES = 3;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * POST /api/ingredients/extract — read a packet from photos. WRITES NOTHING.
 *
 * multipart/form-data:
 *   - front: File (required)
 *   - back:  File (required — the ingredient list and analytical constituents)
 *   - extra: File (optional — feeding guide / energy panel)
 *   - source_confirmation: "physical_pack" (required)
 *
 * Returns the extracted draft for the OWNER to check and correct. Nothing is
 * persisted by this route: no database row, and **no photo is stored** — the
 * images live in memory for the extraction and are then discarded. The owner
 * confirms via POST /api/ingredients/confirm, which is the only write.
 *
 * This is a deliberate change from the old submit-photo flow, which stored
 * every image and queued every submission for admin review. The person who
 * took the photo is holding the packet and is better placed to verify an OCR
 * result than a reviewer looking at it later — owner decision, 2026-07-26.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasGatewayAuth()) {
      return NextResponse.json(
        {
          error:
            'Photo reading is unavailable right now because the AI Gateway is not configured. Please try again later.',
        },
        { status: 503 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with a "front" file field' },
        { status: 400 }
      );
    }

    if (formData.get('source_confirmation') !== 'physical_pack') {
      return NextResponse.json(
        {
          error:
            'This upload route is only for photos of a physical packet. Website information needs a source-aware review route.',
        },
        { status: 400 }
      );
    }

    const images: LabelImage[] = [];
    for (const face of ['front', 'back', 'extra'] as const) {
      const file = formData.get(face);
      if (!file) continue;
      if (!(file instanceof File)) {
        return NextResponse.json({ error: `"${face}" must be a file` }, { status: 400 });
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported image type "${file.type || 'unknown'}" for "${face}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `"${face}" exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
          { status: 413 }
        );
      }

      const raw = Buffer.from(await file.arrayBuffer());
      if (raw.length === 0) {
        return NextResponse.json({ error: `"${face}" is empty` }, { status: 400 });
      }
      if (raw.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `"${face}" exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
          { status: 413 }
        );
      }

      // Strip EXIF/GPS before the bytes leave this server for the model
      // provider. The photo is never stored, but it is still transmitted.
      images.push({
        buffer: stripImageMetadata(raw, file.type),
        mimeType: file.type,
        face,
      });
    }

    if (!images.some((image) => image.face === 'front')) {
      return NextResponse.json({ error: 'A "front" photo is required' }, { status: 400 });
    }
    if (!images.some((image) => image.face === 'back')) {
      return NextResponse.json(
        { error: 'An ingredients-panel "back" photo is required' },
        { status: 400 }
      );
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `At most ${MAX_IMAGES} photos` }, { status: 400 });
    }

    let extracted;
    try {
      extracted = await extractFromLabelPhotos(images);
    } catch (err) {
      const message =
        err instanceof LabelExtractionError
          ? 'We could not read those photos. Try again with the packet flat, in good light, and the text filling the frame.'
          : 'Something went wrong reading the photos.';
      console.error('ingredients/extract: extraction failed', err);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Tell the owner up front if we already hold this product, so the
    // confirmation screen can frame it as "check ours" rather than "add new".
    let existing = null;
    if (extracted.brand && extracted.product_name) {
      const duplicate = await findDuplicateFood(extracted.brand, extracted.product_name);
      if (duplicate) {
        existing = { id: duplicate.id, brand: duplicate.brand, name: duplicate.name };
      }
    }

    return NextResponse.json(
      {
        extracted,
        existing_food: existing,
        photos_stored: false,
        images_read: images.map((i) => i.face),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('ingredients/extract error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
