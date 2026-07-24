import { supabaseAdmin } from './supabase';

/**
 * Supabase Storage for Bristol/BCS chart illustrations (hardening item 6:
 * "nice to have" per the task brief, not a launch blocker). Public bucket —
 * unlike ingredient photos, these are original, non-sensitive reference
 * illustrations meant to be shown to any signed-in owner, same trust level
 * as `foods` reference data (see the RLS migration's public-read reference
 * tables).
 *
 * No new DB table: paths are deterministic (`${chartType}/${value}${ext}`)
 * and a single `manifest.json` object in the same bucket maps
 * "bristol"/"bcs" + value -> public URL, read by the public
 * GET /api/charts/illustrations endpoint. This keeps the "don't add tables
 * outside Part A without flagging it" convention this codebase has followed
 * since Phase 2 intact for a feature this small.
 *
 * IMPORTANT (see src/lib/chartReference.ts's header comment and
 * BUILD_PROGRESS.md): only ORIGINAL illustrations may be uploaded here.
 * Never upload existing brand/body artwork (Purina, WSAVA, the official
 * Bristol Stool Form Scale, etc.) — that's a legal/liability requirement,
 * not a style preference, and this code has no way to enforce it
 * automatically. The admin uploading is responsible for that.
 */
const BUCKET = 'chart-illustrations';
const MANIFEST_PATH = 'manifest.json';
let bucketEnsured = false;

export type ChartType = 'bristol' | 'bcs';

const EXT_BY_MIME: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
};

export const ALLOWED_CHART_IMAGE_MIME_TYPES = Object.keys(EXT_BY_MIME);

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

async function readManifest(): Promise<ChartManifest> {
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(MANIFEST_PATH);
  if (error || !data) return { bristol: {}, bcs: {} };
  try {
    const text = await data.text();
    const parsed = JSON.parse(text);
    return { bristol: parsed.bristol ?? {}, bcs: parsed.bcs ?? {} };
  } catch {
    return { bristol: {}, bcs: {} };
  }
}

async function writeManifest(manifest: ChartManifest): Promise<void> {
  await ensureBucket();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(MANIFEST_PATH, JSON.stringify(manifest), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw error;
}

export async function getChartManifest(): Promise<ChartManifest> {
  return readManifest();
}

/**
 * Uploads (or replaces) the illustration for one chart value, then updates
 * the manifest. Only PNG and SVG are accepted (ALLOWED_CHART_IMAGE_MIME_TYPES)
 * — matches Phase 5's OCR upload validation pattern of checking an explicit
 * MIME allowlist server-side, not just trusting the client.
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
  const path = `${chartType}/${value}${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicUrlData.publicUrl;

  const manifest = await readManifest();
  manifest[chartType][String(value)] = publicUrl;
  await writeManifest(manifest);

  return publicUrl;
}
