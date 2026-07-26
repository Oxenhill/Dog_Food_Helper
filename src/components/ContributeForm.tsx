'use client';

import { useState } from 'react';

/**
 * The two interactive pieces of /contribute: copy the prompt, paste the reply.
 *
 * Written for non-technical contributors, which drives every choice here — no
 * JSON is ever shown to them, no field is named after a database column, and
 * every result is a sentence rather than a status code. The one exception is the
 * rejection reason, which comes straight from the validator: those messages are
 * deliberately written to be actionable by a person ("re-copy the ingredient
 * text exactly as printed"), and paraphrasing them here would only blur them.
 */

interface ResultRow {
  status: 'accepted' | 'already_held' | 'awaiting_review' | 'rejected';
  brand: string;
  name: string;
  reason?: string;
  warning?: string;
}

interface SubmitResponse {
  accepted: number;
  already_held: number;
  awaiting_review: number;
  rejected: number;
  results: ResultRow[];
}

export function PromptBox({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (insecure context, or permission denied). The
      // textarea below is the fallback: it is selectable, so the contributor
      // can still copy by hand rather than hitting a dead end.
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button type="button" onClick={copy} className="btn-primary">
        {copied ? 'Copied ✓' : 'Copy the instructions'}
      </button>
      <details>
        <summary className="cursor-pointer text-[13px] font-semibold text-pine">
          See what gets copied
        </summary>
        <textarea
          readOnly
          value={prompt}
          rows={14}
          className="textarea mt-2 font-mono text-[12px]"
          aria-label="The instructions to paste into your assistant"
        />
      </details>
    </div>
  );
}

export default function ContributeForm({ token }: { token: string }) {
  const [contributor, setContributor] = useState('');
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<SubmitResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResponse(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/contribute/foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, contributor, raw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That didn’t go through. Please try again.');
        return;
      }
      setResponse(json as SubmitResponse);
      // Clear the box only on a submission where something landed, so a total
      // failure leaves the contributor's work in place to retry.
      if ((json as SubmitResponse).accepted > 0) setRaw('');
    } catch {
      setError('Something went wrong. Your text is still here — try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="field">
          <label className="label" htmlFor="contributor">
            Your name
          </label>
          <input
            id="contributor"
            type="text"
            value={contributor}
            onChange={(e) => setContributor(e.target.value)}
            className="input"
            placeholder="So we know who to thank"
          />
          <p className="help-text">Optional, and only visible to us.</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="raw">
            Paste your assistant’s reply
          </label>
          <textarea
            id="raw"
            required
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            className="textarea font-mono text-[12.5px]"
            placeholder="Paste the whole reply here — including the block of data."
          />
          <p className="help-text">
            Paste all of it. Extra text around the data is fine and gets ignored.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || raw.trim() === ''}
          className="btn-primary btn-block"
        >
          {submitting ? 'Sending…' : 'Send these foods'}
        </button>
      </form>

      {error && (
        <div className="callout-alarm mt-4" role="alert">
          {error}
        </div>
      )}

      {response && (
        <div className="mt-4 flex flex-col gap-3" role="status">
          <div className={response.accepted > 0 ? 'callout-disclaimer' : 'callout-info'}>
            <strong>
              {response.accepted > 0
                ? `${response.accepted} food${response.accepted === 1 ? '' : 's'} received — thank you.`
                : 'Nothing new was added this time.'}
            </strong>
            {response.accepted > 0 && (
              <>
                {' '}
                They’ll be checked before they appear in the app.
              </>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {response.results.map((row, index) => (
              <li key={`${row.brand}-${row.name}-${index}`} className="card card-pad">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      row.status === 'accepted'
                        ? 'signal-better'
                        : row.status === 'rejected'
                          ? 'signal-worse'
                          : 'signal-steady'
                    }
                  >
                    {row.status === 'accepted'
                      ? 'Received'
                      : row.status === 'already_held'
                        ? 'Already had it'
                        : row.status === 'awaiting_review'
                          ? 'Already sent in'
                          : 'Not accepted'}
                  </span>
                  <span className="text-[14px] font-semibold text-ink">
                    {row.brand} — {row.name}
                  </span>
                </div>
                {row.reason && <p className="help-text mt-2">{row.reason}</p>}
                {row.warning && <p className="help-text mt-2">{row.warning}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
