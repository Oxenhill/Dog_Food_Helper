'use client';

import ResearchAdmin from '@/components/ResearchAdmin';
import ResearchKnowledgeAdmin from '@/components/ResearchKnowledgeAdmin';

/**
 * Cluster review and individual claim review are the same underlying
 * decision -- approve, edit or reject a source-backed proposition -- so they
 * live on one workspace page instead of being scattered across the app.
 * Each keeps its own existing, independently tested data/action logic
 * (ResearchKnowledgeAdmin's cluster-level approve/reject/edit RPC path and
 * ResearchAdmin's per-claim PATCH path are genuinely different mechanisms,
 * not duplicated UI for the same one) -- this page only unifies where you
 * go to do either, not how either works underneath.
 */
export default function ResearchReviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">The decision that turns a draft into evidence</p>
        <h1 className="page-title mt-2 text-[22px] sm:text-[26px]">Review queue</h1>
        <p className="lead mt-2 max-w-3xl">
          Everything currently awaiting a human decision — proposition clusters awaiting review,
          and individual claims outside a cluster — in one place. Approving activates a cluster and
          its source claims together; it never marks them independently corroborated.
        </p>
      </div>
      <ResearchKnowledgeAdmin />
      <div className="hairline pt-6">
        <p className="eyebrow">Individual claims</p>
        <p className="help-text mt-2 max-w-3xl">
          Claims reviewed outside the cluster workflow — drafted directly, or a cluster member
          being revisited on its own.
        </p>
        <div className="mt-4">
          <ResearchAdmin />
        </div>
      </div>
    </div>
  );
}
