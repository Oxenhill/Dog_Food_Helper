import { supabaseAdmin } from './supabase';

/**
 * Supabase Storage for Bristol/BCS chart illustrations. Public bucket —
 * unlike ingredient photos, these are original, non-sensitive reference
 * illustrations meant to be shown to any signed-in owner, same trust level
 * as `foods` reference data.
 *
 * ---------------------------------------------------------------------------
 * THE BUCKET IS THE INDEX. There is deliberately no manifest.
 *
 * This module used to keep a `manifest.json` object mapping chart value ->
 * public URL, updated on every upload with a read-modify-write:
 *
 *     await upload(path, buffer)          // file written
 *     const manifest = await readManifest()   // READ
 *     manifest[chartType][value] = publicUrl  // MODIFY
 *     await writeManifest(manifest)           // WRITE the whole blob
 *
 * That is a last-write-wins race. Uploading several illustrations at once (or
 * in quick succession) meant two handlers read the same manifest version, each
 * added their own key, and the second write silently dropped the first's
 * entry. Observed in production 2026-07-26: `bristol/4.png` was present in
 * Storage (HTTP 200, 235,544 bytes) but absent from the manifest, so Bristol
 * Type 4 did not render while 1,2,3,5,6,7 did. The owner had also seen an
 * earlier round where none of them appeared.
 *
 * Paths are already deterministic (`${chartType}/${value}${ext}`), so the
 * manifest was a second source of truth that could only ever drift from the
 * first. It is gone: the listing is derived from the bucket on read. There is
 * no shared mutable object, so concurrent uploads cannot lose each other, and
 * any file that uploaded successfully is visible by definition.
 * ---------------------------------------------------------------------------
 *
 * IMPORTANT (see src/lib/chartReference.ts's header comment and
 * BUILD_PROGRESS.md): only ORIGINAL illustrations may be uploaded here.
 * Never upload existing brand/body artwork (Purina, WSAVA, the official
 * Bristol Stool Form Scale, etc.) — that's a legal/liability requirement,
 * not a style preference, and this code has no way to enforce it
 * automatically. The admin uploading is responsible for that.
 */
const BUCKET = 'chart-illustrations';
let bucketEnsured = false;

export type ChartType = 'bristol' | 'bcs';

const CHART_TYPES: ChartType[] = ['bristol', 'bcs'];

const EXT_BY_MIME: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
};

export const ALLOWED_CHART_IMAGE_MIME_TYPES = Object.keys(EXT_BY_MIME);

const ALLOWED_EXTENSIONS = new Set(Object.values(EXT_BY_MIME));

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '2MB',
  });
  if (error && !/already exists/i.test(error.message)) {
    console.warn('[chartIllustrationStorage] createBucket returned an unexpected error', error);
  }
  bucketEnsured = true;
}

export type ChartManifest = Record<ChartType, Record<string, string>>;

/**
 * List one chart type's illustrations straight from the bucket.
 *
 * A filename is only accepted when it is `<integer><allowed extension>` — the
 * exact shape uploadChartIllustration writes. Anything else in the folder is
 * ignored rather than guessed at, so a stray file can never masquerade as a
 * chart level.
 */
async function listChartType(chartType: ChartType): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(chartType, {
    limit: 1000,
  });

  if (error) {
    console.error(`[chartIllustrationStorage] list failed for "${chartType}"`, error);
    return {};
  }

  const out: Record<string, string> = {};
  for (const entry of data ?? []) {
    const name = entry.name;
    const dot = name.lastIndexOf('.');
    if (dot <= 0) continue;

    const stem = name.slice(0, dot);
    const ext = name.slice(dot).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    if (!/^\d+$/.test(stem)) continue;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(`${chartType}/${name}`);
    out[stem] = publicUrlData.publicUrl;
  }
  return out;
}

/**
 * The full listing, derived from the bucket. Both chart types are always
 * present as keys (possibly empty) so callers never have to null-check.
 */
export async function getChartManifest(): Promise<ChartManifest> {
  await ensureBucket();

  const [bristol, bcs] = await Promise.all(CHART_TYPES.map((t) => listChartType(t)));

  return { bristol, bcs };
}

/**
 * Uploads (or replaces) the illustration for one chart value. Only PNG and SVG
 * are accepted (ALLOWED_CHART_IMAGE_MIME_TYPES) — an explicit server-side MIME
 * allowlist, not trusting the client.
 *
 * Writing the file is the ONLY step. There is no index to update, so this is
 * safe to run concurrently for different values.
 */
export async function uploadChartIllustration(
  chartType: ChartType,
  value: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) {
    throw new Error(`Unsupported image type "${mimeType}" — only PNG and SVG are accepted`);
  }

  await ensureBucket();

  // Replacing a value with a different format would otherwise leave the old
  // file behind and make two entries compete for one level on read.
  await removeOtherFormats(chartType, value, ext);

  const path = `${chartType}/${value}${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/** Remove the same value stored under a different allowed extension. */
async function removeOtherFormats(
  chartType: ChartType,
  value: number,
  keepExt: string
): Promise<void> {
  const stale = Array.from(ALLOWED_EXTENSIONS)
    .filter((ext) => ext !== keepExt)
    .map((ext) => `${chartType}/${value}${ext}`);

  if (stale.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(stale);
  // Removing a file that isn't there is expected and not an error worth raising.
  if (error) {
    console.warn('[chartIllustrationStorage] could not clear stale format(s)', error);
  }
}

// The obsolete manifest.json was deleted from the bucket on 2026-07-26. Even
// if one reappeared it would be ignored: listChartType() only reads inside the
// `bristol/` and `bcs/` prefixes, and only accepts `<integer><ext>` filenames.
