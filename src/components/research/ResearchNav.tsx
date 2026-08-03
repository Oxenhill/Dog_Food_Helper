'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: { href: string; label: string; hint: string }[] = [
  { href: '/admin/research', label: 'Home', hint: 'At a glance' },
  { href: '/admin/research/intake', label: 'Intake', hint: 'Bring research in' },
  { href: '/admin/research/review', label: 'Review queue', hint: 'Decide what becomes evidence' },
  { href: '/admin/research/missions', label: 'Mission monitor', hint: 'Persisted operations & cost' },
  { href: '/admin/research/explorer', label: 'Evidence explorer', hint: 'Quote-and-provenance reference' },
  { href: '/admin/research/graph', label: 'Graph canvas', hint: 'Spatial map — grouping & time' },
  { href: '/admin/research/retractions', label: 'Retraction watch', hint: 'What changed, and what it affected' },
];

/**
 * Secondary nav for the research workspace. Deliberately not the app's
 * primary /admin nav (that stays one flat "Research" link, still handled by
 * AdminShell) -- this is the answer to "the research layer needs multiple
 * pages, not one page crammed full of stuff."
 */
export default function ResearchNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Research workspace" className="flex flex-none flex-col gap-1 lg:w-[196px]">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-[13.5px] transition ${
              active
                ? 'border-pine/20 bg-pine-tint font-semibold text-pine-dark'
                : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
            }`}
          >
            <span>{item.label}</span>
            <span className="text-[11px] font-normal text-ink-soft">{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
