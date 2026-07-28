'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getUserId } from '@/lib/clientAuth';
import LabelCapture from '@/components/LabelCapture';

/**
 * "Add a food from the packet" — the owner-facing capture flow.
 *
 * Requires a signed-in account (owner decision): submissions are attributable,
 * the endpoint that spends model credits is not open to the world, and the
 * food can be tied back to the dogs it is fed to.
 */
export default function AddFoodPage() {
  return (
    <Suspense fallback={null}>
      <AddFood />
    </Suspense>
  );
}

function AddFood() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dogId = searchParams.get('dog') ?? undefined;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    setReady(true);
  }, [router]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-page">
        <Link
          href={dogId ? `/dogs/${dogId}` : '/dogs'}
          className="muted text-[13px] font-semibold text-pine hover:underline"
        >
          {dogId ? '← Back to your dog' : '← Your dogs'}
        </Link>

        <p className="eyebrow mt-4">Add a food</p>
        <h1 className="page-title mt-1">Scan a packet</h1>
        <p className="lead mt-2">
          Photograph the front and back of the packet and we&apos;ll read the label. You check it,
          correct anything we got wrong, and it&apos;s linked to your dog.
        </p>

        <div className="mt-6">
          {ready &&
            (dogId ? (
              <LabelCapture dogId={dogId} />
            ) : (
              <div className="callout-info">
                <p className="font-semibold text-ink">Choose a dog first</p>
                <p className="mt-1">
                  A packet capture must be linked to the dog eating it; an unlinked food is not a
                  successful capture.
                </p>
                <Link href="/dogs" className="btn-primary mt-3 inline-flex">
                  Choose a dog
                </Link>
              </div>
            ))}
        </div>

        <div className="callout-disclaimer mt-8">
          We only ever record what&apos;s printed on the packet. Nothing is guessed or filled in from
          elsewhere — if a detail isn&apos;t on the label, we leave it blank.
        </div>
      </main>
    </div>
  );
}
