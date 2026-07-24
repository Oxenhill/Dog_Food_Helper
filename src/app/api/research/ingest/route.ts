import { NextRequest, NextResponse } from 'next/server';
import { ingestResearchDocument } from '@/lib/embeddingPipeline';
import { requireAdmin } from '@/lib/serverAdminAuth';
import { ResearchTopic, ReviewStatus } from '@/lib/types';

const VALID_TOPICS: ResearchTopic[] = ['gut_biome', 'allergy', 'health_condition', 'general'];
const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

/**
 * POST /api/research/ingest (Part B / Phase 4 item 6 — admin only)
 *
 * Gated by requireAdmin() — a real Supabase session bearer token resolving
 * to a user_profiles.is_admin=true row. Replaces the RESEARCH_INGEST_ADMIN_TOKEN
 * shared-secret stopgap this route used since Phase 4.
 *
 * Body: { title, topic, text, source_url?, review_status?, supersedes_document_id? }
 * `review_status` defaults to 'pending' (never auto-live) unless explicitly
 * set to 'approved' by the caller — matches the "never auto-merge unreviewed
 * content" principle applied to research (architecture doc §7's analog).
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
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
