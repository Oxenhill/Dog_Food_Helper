'use client';

import AdminShell from '@/components/AdminShell';
import LabelCapture from '@/components/LabelCapture';
import ContributedFoodsAdmin from '@/components/ContributedFoodsAdmin';
import FoodsAdmin from '@/components/FoodsAdmin';

/**
 * Standalone bulk packet-testing page (owner request, 2026-07-28):
 * capture + review queue, so the owner can test packs without a dog in the
 * loop. Reuses LabelCapture in 'contribute' mode (writes to
 * contributed_foods via /api/admin/foods/capture, never straight to
 * `foods`) and the existing ContributedFoodsAdmin review queue unchanged —
 * that queue already shows every contributed_foods origin (friend
 * submissions, crawler harvests, and now admin captures), side by side with
 * composition_raw, so nothing new was needed there.
 *
 * The existing "Food database" browser (FoodsAdmin) already lived at this
 * route; kept below rather than removed, since nothing asked for it to go.
 */
export default function AdminFoodsPage() {
  return (
    <AdminShell eyebrow="Studio" title="Foods">
      <section className="flex flex-col gap-4">
        <h2 className="section-title">1. Capture a packet</h2>
        <p className="help-text">
          Same capture/extract flow as the owner-facing one — no dog required. Result goes to the
          review queue below (contributed_foods, status=pending), never straight into the catalogue.
        </p>
        <LabelCapture mode="contribute" />
      </section>

      <section className="mt-10 flex flex-col gap-4">
        <h2 className="section-title">2 &amp; 3. Review queue</h2>
        <p className="help-text">
          Every pending contribution — friend submissions, crawler harvests, and packet captures
          from above. Approve writes to `foods`/`food_ingredients`; reject requires a note.
        </p>
        <ContributedFoodsAdmin />
      </section>

      <section className="mt-10 flex flex-col gap-4">
        <h2 className="section-title">Food database</h2>
        <FoodsAdmin />
      </section>
    </AdminShell>
  );
}
