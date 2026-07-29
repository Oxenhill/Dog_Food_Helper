'use client';

/**
 * Client-side packet-photo preparation.
 *
 * The crop is applied before the photo leaves the device. The resulting JPEG
 * is capped so a front + ingredients-panel upload stays below Vercel's request
 * limit, and the same canvas is checked for common OCR failure modes.
 */
const MAX_DIMENSION = 1600;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.5;
const TARGET_BYTES = 1.5 * 1024 * 1024;
const QUALITY_SAMPLE_DIMENSION = 320;

export interface CropInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type ImageQualityIssueCode =
  | 'low_resolution'
  | 'blur_or_low_contrast'
  | 'too_dark'
  | 'too_bright';

export interface ImageQualityIssue {
  code: ImageQualityIssueCode;
  severity: 'block' | 'warning';
  message: string;
}

export interface ImageQualityMeasurements {
  width: number;
  height: number;
  meanLuma: number;
  darkFraction: number;
  brightFraction: number;
  edgeContrast: number;
}

export interface PreparedImage {
  file: File;
  measurements: ImageQualityMeasurements;
  issues: ImageQualityIssue[];
}

export class ImageResizeError extends Error {}

/**
 * Only resolution is a hard stop. Blur and lighting checks are useful
 * warnings, but phone cameras and packet designs vary too much for a
 * heuristic to reject an otherwise readable image.
 */
export function assessImageQuality(
  measurements: ImageQualityMeasurements
): ImageQualityIssue[] {
  const issues: ImageQualityIssue[] = [];

  if (
    measurements.width < 600 ||
    measurements.height < 400 ||
    measurements.width * measurements.height < 400_000
  ) {
    issues.push({
      code: 'low_resolution',
      severity: 'block',
      message:
        'This crop is too small for reliable reading. Use more of the original photo or take a closer photo.',
    });
  }

  if (measurements.edgeContrast < 7) {
    issues.push({
      code: 'blur_or_low_contrast',
      severity: 'warning',
      message:
        'The text may be blurred or hazy. Wipe the camera lens and remove any scratched or dirty phone cover, then retake it with the text in focus.',
    });
  }

  if (measurements.meanLuma < 48 || measurements.darkFraction > 0.45) {
    issues.push({
      code: 'too_dark',
      severity: 'warning',
      message:
        'This photo looks dark. Retake it in brighter, even light without casting a shadow over the packet.',
    });
  } else if (measurements.meanLuma > 225 || measurements.brightFraction > 0.45) {
    issues.push({
      code: 'too_bright',
      severity: 'warning',
      message:
        'This photo may be washed out by glare. Change the angle or lighting so the printed text stays visible.',
    });
  }

  return issues;
}

export async function prepareImageForUpload(
  file: File,
  crop: CropInsets = { left: 0, right: 0, top: 0, bottom: 0 }
): Promise<PreparedImage> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new ImageResizeError('Photo preparation is only available in a browser.');
  }

  validateCrop(crop);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new ImageResizeError(
      `Could not decode "${file.name}" (${file.type || 'unknown type'}, ${file.size} bytes): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const sourceX = Math.round((crop.left / 100) * bitmap.width);
  const sourceY = Math.round((crop.top / 100) * bitmap.height);
  const sourceWidth = Math.max(
    1,
    bitmap.width - sourceX - Math.round((crop.right / 100) * bitmap.width)
  );
  const sourceHeight = Math.max(
    1,
    bitmap.height - sourceY - Math.round((crop.bottom / 100) * bitmap.height)
  );
  const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new ImageResizeError('This device could not prepare the photo.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height
  );
  bitmap.close();

  const measurements = measureImage(canvas, sourceWidth, sourceHeight);
  const issues = assessImageQuality(measurements);

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }

  if (!blob) {
    throw new ImageResizeError(`Could not encode "${file.name}" as JPEG.`);
  }

  const name = file.name.replace(/\.\w+$/, '') + '-crop.jpg';
  return {
    file: new File([blob], name, { type: 'image/jpeg' }),
    measurements,
    issues,
  };
}

export async function resizeImageForUpload(file: File): Promise<File> {
  return (await prepareImageForUpload(file)).file;
}

function validateCrop(crop: CropInsets) {
  const values = [crop.left, crop.right, crop.top, crop.bottom];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 45)) {
    throw new ImageResizeError('Crop values must be between 0 and 45 percent.');
  }
  if (crop.left + crop.right >= 90 || crop.top + crop.bottom >= 90) {
    throw new ImageResizeError('The crop must leave some of the photo visible.');
  }
}

function measureImage(
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number
): ImageQualityMeasurements {
  const sampleScale = Math.min(
    1,
    QUALITY_SAMPLE_DIMENSION / Math.max(canvas.width, canvas.height)
  );
  const sampleWidth = Math.max(2, Math.round(canvas.width * sampleScale));
  const sampleHeight = Math.max(2, Math.round(canvas.height * sampleScale));
  const sample = document.createElement('canvas');
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new ImageResizeError('This device could not check the photo quality.');
  }
  ctx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

  const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const luma = new Float32Array(sampleWidth * sampleHeight);
  let lumaTotal = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let pixel = 0, index = 0; pixel < pixels.length; pixel += 4, index += 1) {
    const value =
      0.2126 * pixels[pixel] +
      0.7152 * pixels[pixel + 1] +
      0.0722 * pixels[pixel + 2];
    luma[index] = value;
    lumaTotal += value;
    if (value < 35) darkPixels += 1;
    if (value > 245) brightPixels += 1;
  }

  let edgeTotal = 0;
  let edgeSamples = 0;
  for (let y = 1; y < sampleHeight; y += 1) {
    for (let x = 1; x < sampleWidth; x += 1) {
      const index = y * sampleWidth + x;
      edgeTotal += Math.abs(luma[index] - luma[index - 1]);
      edgeTotal += Math.abs(luma[index] - luma[index - sampleWidth]);
      edgeSamples += 2;
    }
  }

  const pixelCount = sampleWidth * sampleHeight;
  return {
    width: sourceWidth,
    height: sourceHeight,
    meanLuma: lumaTotal / pixelCount,
    darkFraction: darkPixels / pixelCount,
    brightFraction: brightPixels / pixelCount,
    edgeContrast: edgeSamples ? edgeTotal / edgeSamples : 0,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
