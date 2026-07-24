import { NextRequest, NextResponse } from 'next/server';
import { ingestResearchDocument } from '@/lib/embeddingPipeline';
import { ResearchTopic, ReviewStatus } from '@/lib/types';

const VALID_TOPICS: ResearchTopic[] = ['gut_biome', 'allergy', 'health_condition', 'general'];
const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

/**
 * POST /api/research/ingest (Part B / Phase 4 item 6 — admin only)
 *
 * There is no real admin/session system yet (still a stopgap since Phase 2 —
 * see BUILD_PROGRESS.md's Phase 2 deviation #6, clientAuth.ts). Gating this
 * behind a shared secret header is a deliberate, minimal stand-in — anyone
 * with the `RESEARCH_INGEST_ADMIN_TOKEN` env value can call this, which is
 * fine for a single-owner Phase 4 build but is NOT a real admin auth system
 * and must not be treated as one once there are other users. Flagged in
 * BUILD_PROGRESS.md.
 *
 * Body: { title, topic, text, source_url?, review_status?, supersedes_document_id? }
 * `review_status` defaults to 'pending' (never auto-live) unless explicitly
 * set to 'approved' by the caller — matches the "never auto-merge unreviewed
 * content" principle applied to research (architecture doc §7's analog).
 */
export async function POST(request: NextRequest) {
  try {
    const adminToken = process.env.RESEARCH_INGEST_ADMIN_TOKEN;
    if (!adminToken) {
      return NextResponse.json(
        { error: 'RESEARCH_INGEST_ADMIN_TOKEN is not configured on the server — ingestion is disabled.' },
        { status: 503 }
      );
    }
    const providedToken = request.headers.get('x-admin-token');
    if (providedToken !== adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      topic,
      text,
      source_url,
      review_status,
      supersedes_document_id,
    }: {
      title?: string;
      topic?: string;
      text?: string;
      source_url?: string;
      review_status?: string;
      supersedes_document_id?: string;
    } = body;

    if (!title || !topic || !text) {
      return NextResponse.json({ error: 'title, topic, and text are required' }, { status: 400 });
    }
    if (!VALID_TOPICS.includes(topic as ResearchTopic)) {
      return NextResponse.json(
        { error: `topic must be one of: ${VALID_TOPICS.join(', ')}` },
        { status: 400 }
      );
    }
    if (review_status && !VALID_REVIEW_STATUSES.includes(review_status as ReviewStatus)) {
      return NextResponse.json(
        { error: `review_status must be one of: ${VALID_REVIEW_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await ingestResearchDocument({
      title,
      topic: topic as ResearchTopic,
      text,
      source_url: source_url ?? null,
      review_status: (review_status as ReviewStatus) ?? 'pending',
      supersedes_document_id: supersedes_document_id ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Research ingest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
