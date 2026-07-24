import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAdminAuth';
import {
  ALLOWED_CHART_IMAGE_MIME_TYPES,
  ChartType,
  uploadChartIllustration,
} from '@/lib/chartIllustrationStorage';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — small static illustrations, not photos
const VALID_CHART_TYPES: ChartType[] = ['bristol', 'bcs'];
const VALID_VALUES: Record<ChartType, number[]> = {
  bristol: [1, 2, 3, 4, 5, 6, 7],
  bcs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

/**
 * POST /api/admin/charts/upload — admin-only (requireAdmin, same real
 * Supabase-session + user_profiles.is_admin check as every other admin
 * route). Uploads (or replaces) the original illustration for one Bristol
 * stool-scale value (1-7) or BCS value (1-9).
 *
 * multipart/form-data body:
 *   - chart_type: 'bristol' | 'bcs' (required)
 *   - value: number, within the valid range for that chart_type (required)
 *   - image: File, PNG or SVG only (required)
 *
 * IMPORTANT: only upload ORIGINAL illustrations. Never upload existing
 * brand/body artwork (Purina, WSAVA, the official Bristol Stool Form Scale,
 * etc.) — see src/lib/chartReference.ts / src/lib/chartIllustrationStorage.ts
 * header comments. This is a legal/liability requirement this endpoint has
 * no way to enforce automatically — it's on the admin uploading.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with chart_type, value, and image fields' },
        { status: 400 }
      );
    }

    const chartType = formData.get('chart_type');
    if (typeof chartType !== 'string' || !VALID_CHART_TYPES.includes(chartType as ChartType)) {
      return NextResponse.json(
        { error: `chart_type must be one of: ${VALID_CHART_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const valueRaw = formData.get('value');
    const value = Number(valueRaw);
    if (!Number.isInteger(value) || !VALID_VALUES[chartType as ChartType].includes(value)) {
      return NextResponse.json(
        {
          error: `value must be an integer in [${VALID_VALUES[chartType as ChartType].join(', ')}] for chart_type "${chartType}"`,
        },
        { status: 400 }
      );
    }

    const file = formData.get('image');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '"image" file field is required' }, { status: 400 });
    }

    if (!ALLOWED_CHART_IMAGE_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image type "${file.type || 'unknown'}". Allowed: ${ALLOWED_CHART_IMAGE_MIME_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Image exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Uploaded image is empty or too large' }, { status: 400 });
    }

    const url = await uploadChartIllustration(chartType as ChartType, value, buffer, file.type);

    return NextResponse.json({ chart_type: chartType, value, url }, { status: 200 });
  } catch (error) {
    console.error('admin/charts/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
