'use client';

/**
 * Report a client-side diagnostic to /api/client-log. Fire-and-forget by
 * design: this exists to explain a failure, so it must never itself throw,
 * block, or delay the caller. `keepalive` lets the request survive if the
 * user backgrounds the tab or the page unloads right after an error.
 */
export function reportClientError(
  event: string,
  details?: { status?: number; bytes?: number; message?: string; context?: Record<string, unknown> }
): void {
  try {
    void fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...details }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow — see above.
  }
}
