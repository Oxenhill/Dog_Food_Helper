import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </span>
          <Link href="/signin" className="btn-ghost btn-sm">
            Sign in
          </Link>
        </div>
      </header>

      <main className="container-page">
        {/* Hero — the thesis: one dog's measured response over time.
            The full lockup belongs here rather than in the header: it carries
            the tagline and the Dog Smart endorsement, which need room to be
            read. The header keeps a compact text wordmark. */}
        <section className="pt-6 sm:pt-10">
          {/* width/height are the DISPLAY size, not the asset's intrinsic
              1254px: passing the intrinsic size made Next generate a srcset
              for a 1254px slot and serve a 1920px-wide render (1.18 MB) for a
              196px image. Sized correctly it serves ~111 KB. `sizes` matches
              the responsive widths in className so the right candidate is
              picked at each breakpoint. */}
          <Image
            src="/bowl-logo.png"
            alt="Bowl — Every dog is different. Every choice matters. By Dog Smart."
            width={196}
            height={196}
            sizes="(min-width: 640px) 196px, 168px"
            priority
            className="mb-2 h-auto w-[168px] sm:w-[196px]"
          />
          <p className="eyebrow">Decision support · one dog at a time</p>
          <h1 className="page-title mt-3 text-[32px] leading-[1.05] sm:text-[44px]">
            Every dog is different.
            <br />
            Every choice matters.
          </h1>
          <p className="lead mt-5 max-w-prose">
            Every dog responds to food differently. Bowl records your
            dog&apos;s baseline, watches how digestion, energy, and coat shift
            when their food changes, and turns that into calm, evidence-honest
            recommendations — never a guess dressed up as certainty.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary">
              Create an account
            </Link>
            <Link href="/signin" className="btn-secondary">
              I already have one
            </Link>
          </div>
        </section>

        {/* Signature — a sample response log (baseline → shift) */}
        <section className="mt-12">
          <div className="card card-pad">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Sample response log</p>
              <span className="metric text-[12px] text-ink-soft">day 14</span>
            </div>
            <p className="section-title mt-1">Scout · after a food change</p>

            <ul className="mt-4 flex flex-col divide-y divide-line">
              {[
                { metric: "Stool consistency", note: "settled by day 10", signal: "better" },
                { metric: "Energy", note: "steady vs baseline", signal: "steady" },
                { metric: "Gas / wind", note: "worse first week", signal: "worse" },
                { metric: "Coat & skin", note: "too early to call", signal: "steady" },
              ].map((row) => (
                <li
                  key={row.metric}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="text-[14px] font-medium text-ink">
                    {row.metric}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="metric hidden text-[12px] text-ink-soft sm:inline">
                      {row.note}
                    </span>
                    <span
                      className={
                        row.signal === "better"
                          ? "signal-better"
                          : row.signal === "worse"
                            ? "signal-worse"
                            : "signal-steady"
                      }
                    >
                      {row.signal === "better"
                        ? "↑ better"
                        : row.signal === "worse"
                          ? "↓ worse"
                          : "→ steady"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="help-text mt-4">
              Different signals settle on different timelines — digestion in days,
              coat in weeks. The tool waits the right amount before drawing a
              conclusion.
            </p>
          </div>
        </section>

        {/* How it works — a genuine sequence, so numbering carries meaning */}
        <section className="mt-12">
          <p className="eyebrow">How it works</p>
          <ol className="mt-4 flex flex-col gap-4">
            {[
              {
                n: "01",
                t: "Set a baseline",
                d: "Record where your dog is today — stool, body condition, coat, energy — as the reference point everything else is measured against.",
              },
              {
                n: "02",
                t: "Log the shifts",
                d: "A few taps after a food change. Better, worse, or no change — measured against the baseline, not scored in a vacuum.",
              },
              {
                n: "03",
                t: "Get honest recommendations",
                d: "Hard safety filters for allergies and conditions come first; scoring and any research only ever refine what's already safe.",
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="metric mt-0.5 text-[13px] font-semibold text-pine-soft">
                  {step.n}
                </span>
                <div>
                  <h3 className="section-title">{step.t}</h3>
                  <p className="lead mt-1">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Disclaimer — given weight, language unchanged */}
        <section className="mt-12">
          <div className="callout-disclaimer">
            <p className="eyebrow mb-1.5 text-pine">Important</p>
            Bowl is a decision-support tool, not a diagnostic or
            veterinary service. Always consult your veterinarian before making
            significant changes to your dog&apos;s diet, especially if your dog
            has existing health conditions.
          </div>
        </section>

        <footer className="mt-14 border-t border-line pt-6">
          <p className="metric text-[12px] text-ink-soft">Bowl · by Dog Smart</p>
        </footer>
      </main>
    </div>
  );
}
