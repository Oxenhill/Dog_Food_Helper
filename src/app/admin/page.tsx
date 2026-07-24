'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { sessionAuthHeaders } from '@/lib/session';

interface OverviewCounts {
  foods: number | null;
  food_ingredients: number | null;
  users: number | null;
  admins: number | null;
  research_documents: number | null;
  research_chunks: number | null;
  review_queue_pending: number | null;
  condition_contraindications: number | null;
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' ? String(n) : '—';
}

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/overview', { headers: sessionAuthHeaders() });
        if (!active) return;
        if (!res.ok) {
          setError('Could not load dashboard counts.');
          return;
        }
        const json = await res.json();
        if (active) setCounts(json.counts ?? null);
      } catch {
        if (active) setError('Could not load dashboard counts.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const cards: {
    href: string;
    title: string;
    metric: string;
    sub: string;
    safety?: boolean;
  }[] = [
    {
      href: '/admin/foods',
      title: 'Food database',
      metric: fmt(counts?.foods),
      sub: `${fmt(counts?.food_ingredients)} ingredient rows · review & correct composition`,
    },
    {
      href: '/admin/contraindications',
      title: 'Contraindications',
      metric: fmt(counts?.condition_contraindications),
      sub: 'Approved condition → ingredient / nutrient rules (safety layer)',
      safety: true,
    },
    {
      href: '/admin/research',
      title: 'Research layer',
      metric: fmt(counts?.research_documents),
      sub: `${fmt(counts?.research_chunks)} chunks · evidence for recommendations`,
    },
    {
      href: '/admin/review-queue',
      title: 'Review queue',
      metric: fmt(counts?.review_queue_pending),
      sub: 'Owner-submitted ingredient photos awaiting review',
    },
    {
      href: '/admin/users',
      title: 'Users',
      metric: fmt(counts?.users),
      sub: `${fmt(counts?.admins)} admin · roles & access`,
    },
    {
      href: '/admin/charts',
      title: 'Chart illustrations',
      metric: '',
      sub: 'Upload Bristol / BCS reference artwork',
    },
  ];

  return (
    <AdminShell eyebrow="Studio" title="Admin dashboard">
      {error && (
        <div className="callout-alarm mb-6" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card-link">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="section-title">{c.title}</span>
                {c.safety && <span className="signal-worse">safety</span>}
              </div>
              {c.metric !== '' && (
                <span className="metric text-[22px] font-semibold text-pine">
                  {loading ? '·' : c.metric}
                </span>
              )}
            </div>
            <p className="help-text mt-2">{c.sub}</p>
            <p className="eyebrow mt-3">Manage →</p>
          </Link>
        ))}
      </div>

      <p className="help-text mt-8">
        Counts are read live. Management surfaces are admin-gated and re-checked
        server-side on every request.
      </p>
    </AdminShell>
  );
}
