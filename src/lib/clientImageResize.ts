'use client';

/**
 * Downscale a camera photo client-side before it is uploaded.
 *
 * Vercel's serverless functions reject any request body over ~4.5MB at the
 * platform edge, before our route handler ever runs — the response is an
 * HTML error page, not JSON, and it fails instantly (no processing time),
 * which is exactly what made this look like an immediate, unexplained
 * "something went wrong" to the owner testing packet capture. A modern
 * phone's full-resolution front+back photos routinely total well over that
 * on their own, even though each is under the app's own 8MB-per-image limit
 * (src/app/api/ingredients/extract/route.ts) — that limit was never the one
 * that mattered.
 *
 * Packet text (brand, ingredients, the percentages panel) stays legible to
 * the OCR model at far lower resolution than a camera captures, so we
 * re-encode to a bounded max dimension and JPEG quality rather than
 * building a signed-upload path just to move a bigger blob around.
 */
const MAX_DIMENSION = 1600;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.5;
const TARGET_BYTES = 1.5 * 1024 * 1024;

export async function resizeImageForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Format the browser can't decode into a bitmap (rare) — send as-is and
    // let the server-side size/type checks handle it.
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }

  if (!blob) return file;

  const name = file.name.replace(/\.\w+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
