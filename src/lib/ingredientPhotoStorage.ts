import { supabaseAdmin } from './supabase';

/**
 * Supabase Storage bucket for owner-submitted ingredient photos (Phase 5).
 *
 * Not `public` — photos may still show a home background even after EXIF
 * stripping, and this is Tier 2 (owner-submitted, review-queue-gated) data,
 * not published food-dataset content. Only the service role (server-side)
 * reads/writes it; nothing in this codebase exposes a public URL for these
 * objects.
 *
 * The bucket is created lazily/idempotently on first upload rather than via
 * a separate manual Supabase-dashboard step, so `submit-photo` works
 * end-to-end without an out-of-band setup step being missed. If it already
 * exists (including from a prior request in the same warm serverless
 * instance), `createBucket`'s "already exists" error is expected and
 * swallowed.
 */
const BUCKET = 'ingredient-photos';
let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '8MB',
  });
  if (error && !/already exists/i.test(error.message)) {
    console.warn('[ingredientPhotoStorage] createBucket returned an unexpected error', error);
  }
  bucketEnsured = true;
}

export async function uploadIngredientPhoto(
  buffer: Buffer,
  mimeType: string,
  path: string
): Promise<string> {
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return data.path;
}
