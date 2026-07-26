import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { isContributorAuthorized, contributorTokenConfigured } from '@/lib/contributorAuth';
import { buildContributorPrompt } from '@/lib/contributorPrompt';
import ContributeForm, { PromptBox } from '@/components/ContributeForm';

/**
 * /contribute?key=… — the one link a contributor needs.
 *
 * A server component so the token is checked before any of this renders, and so
 * the prompt is built server-side from the real request host (it embeds the
 * absolute URL of the known-foods list, which the contributor's chat session
 * fetches). A wrong or missing key renders nothing but a dead end.
 *
 * The page holds the prompt as well as the paste box for one practical reason:
 * a chat session cannot POST, so a copy-paste hop is unavoidable, and putting
 * the instructions on the same page as the box means the owner distributes a
 * single link instead of a link plus a document that would drift out of step
 * with the validator.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Help build the food list — Bowl',
  // Contributor-only working page: keep it out of search results.
  robots: { index: false, follow: false },
};

function baseUrlFromHeaders(): string {
  const h = headers();
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default function ContributePage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const key = typeof searchParams.key === 'string' ? searchParams.key : null;

  if (!isContributorAuthorized(key)) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="wordmark">
              <span className="wordmark-dot" />
              Bowl
            </Link>
          </div>
        </header>
        <main className="container-narrow">
          <h1 className="page-title mt-6">This link isn’t valid</h1>
          <p className="lead mt-2">
            {contributorTokenConfigured()
              ? 'The link may have been copied incompletely, or it may have been replaced. Ask whoever sent it for a fresh one.'
              : 'Contributions aren’t open at the moment.'}
          </p>
        </main>
      </div>
    );
  }

  const baseUrl = baseUrlFromHeaders();
  const prompt = buildContributorPrompt(baseUrl);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <Image
          src="/bowl-logo.png"
          alt="Bowl — Every dog is different. Every choice matters. By Dog Smart."
          width={120}
          height={120}
          sizes="120px"
          priority
          className="mb-4 h-auto w-[120px]"
        />
        <p className="eyebrow">Thank you</p>
        <h1 className="page-title mt-2">Help build the food list</h1>
        <p className="lead mt-2">
          Bowl helps owners pick food for dogs with allergies and health conditions. It can only do
          that for foods it knows about. You’re helping it know about more of them.
        </p>

        <div className="callout-disclaimer mt-5">
          <strong>The one thing that matters:</strong> everything must be copied from the
          manufacturer’s own page, exactly as printed. If your assistant can’t read a page, the right
          answer is to skip that food and say so. A missing food costs us very little. A food with the
          wrong ingredients could mean a dog gets fed something it’s allergic to.
        </div>

        <ol className="mt-6 flex flex-col gap-5">
          <li className="card card-pad">
            <p className="label">Step 1</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">
              Copy the instructions below and paste them into a new Claude chat.
            </p>
            <PromptBox prompt={prompt} />
          </li>

          <li className="card card-pad">
            <p className="label">Step 2</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">
              Let it work. It’ll check what’s already in the list, look up products that aren’t, and
              finish by printing a block of data. If it says it couldn’t read some pages, that’s
              fine and expected — better than it guessing.
            </p>
          </li>

          <li className="card card-pad">
            <p className="label">Step 3</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">
              Copy its whole reply and paste it in below. Don’t worry about tidying it up.
            </p>
            <ContributeForm token={key!} />
          </li>
        </ol>

        <p className="muted mt-6 text-[13px]">
          Nothing you send goes live straight away — every food is checked before it reaches the app.
        </p>
      </main>
    </div>
  );
}
