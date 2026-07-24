/**
 * Minimal Resend REST API client (hardening item: inactivity warnings were
 * previously logged only, never actually delivered to the user).
 *
 * Uses raw `fetch` against Resend's API rather than the `resend` npm
 * package, matching the pattern already established in batchApiHelper.ts —
 * avoids adding a new dependency in a sandbox that has repeatedly hit
 * npm-install corruption on new/transitive deps (see BUILD_PROGRESS.md
 * Phase 5/6 notes). Resend was picked over SendGrid/SES because its API is a
 * single JSON POST with no AWS-credential setup or multi-step verification
 * flow — a judgement call, not a spec requirement; swapping providers only
 * touches this one file.
 */

const RESEND_API_BASE = 'https://api.resend.com';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email via Resend. Returns `false` (never throws) if the provider
 * isn't configured or the request fails — callers that gate a state-machine
 * transition on "was this actually delivered" (accountLifecycle.ts only
 * stamps `inactivity_warning_sent_at` on success) depend on this failing
 * closed rather than silently reporting success.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !from) {
    console.warn(
      `[emailProvider] RESEND_API_KEY and/or EMAIL_FROM_ADDRESS not set — email to ${input.to} ("${input.subject}") was NOT sent. Set both env vars before relying on real email delivery.`
    );
    return false;
  }

  try {
    const res = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[emailProvider] Resend send to ${input.to} failed: ${res.status} ${text}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[emailProvider] Resend request to ${input.to} threw`, err);
    return false;
  }
}
