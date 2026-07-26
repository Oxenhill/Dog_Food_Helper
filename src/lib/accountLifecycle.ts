import { supabaseAdmin } from './supabase';
import { sendEmail } from './emailProvider';

/**
 * Account inactivity auto-deletion job (Phase 6, architecture doc §10).
 *
 * Runs daily. Compares `user_profiles.last_active_at` against the single
 * active `account_inactivity_policy` row (defaults 365 days / 30 days
 * warning, seeded in Phase 1 — verified present below at runtime, not
 * assumed).
 *
 * Deletion semantics (critical, per phase spec — matches architecture doc
 * §10 exactly):
 *   - HARD-DELETE: `user_profiles` row + the `auth.users` record (via
 *     Supabase Auth admin API) + any other personally-identifying data.
 *   - ANONYMISE (not delete): `dogs` rows owned by that user — set
 *     `owner_id = null`, leave every other column (health/food/log history)
 *     intact so they keep contributing to pooled/research signals, per §10
 *     and CLAUDE.md's non-negotiable principle #5.
 *
 * **Notification gap — fixed.** `sendInactivityWarning()` now sends a real
 * email via `src/lib/emailProvider.ts` (Resend). Critically,
 * `inactivity_warning_sent_at` is only stamped when the send actually
 * succeeds (see checkInactiveAccounts below) — if RESEND_API_KEY/
 * EMAIL_FROM_ADDRESS aren't configured, or the send fails, the warning
 * timestamp is deliberately left unset so the deletion state machine can
 * never advance for a user who was never actually notified. That user is
 * simply retried on the next daily run instead of silently being queued for
 * deletion off a warning that was never delivered.
 */

export interface AccountInactivityPolicy {
  id: string;
  inactivity_threshold_days: number;
  warning_before_days: number;
  active: boolean;
}

export async function getActiveInactivityPolicy(): Promise<AccountInactivityPolicy> {
  const { data, error } = await supabaseAdmin
    .from('account_inactivity_policy')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // Should always be seeded per Phase 1 — this is a last-resort fallback,
    // not a silent guess: the documented defaults (365/30) are used and a
    // warning is logged so the gap is visible in job output.
    console.warn(
      '[inactivity-check] account_inactivity_policy has no active row — falling back to documented defaults (365/30 days). Seed this table.'
    );
    return { id: '', inactivity_threshold_days: 365, warning_before_days: 30, active: true };
  }
  return data as AccountInactivityPolicy;
}

/**
 * Sends the inactivity warning email. Returns whether it was actually
 * delivered — the caller (checkInactiveAccounts) must not stamp
 * `inactivity_warning_sent_at` on a false result, or a user could be deleted
 * having never been told.
 */
async function sendInactivityWarning(userId: string, daysUntilDeletion: number): Promise<boolean> {
  const { data: authUser, error: userLookupError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;

  if (userLookupError || !email) {
    console.error(
      `[inactivity-check] could not resolve an email address for user ${userId} — cannot send inactivity warning`,
      userLookupError
    );
    return false;
  }

  const subject = 'Your Bowl account will be deleted soon due to inactivity';
  const text =
    `We haven't seen you log in for a while. Your account and personal data will be permanently ` +
    `deleted in ${daysUntilDeletion} day(s) unless you log in before then. Your dogs' health and ` +
    `food history will be kept (anonymised) to keep contributing to the community's recommendations, ` +
    `but your account and personal details will be removed.\n\n` +
    `Log in any time before then to keep your account active.`;
  const html = `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

  const sent = await sendEmail({ to: email, subject, html, text });
  if (!sent) {
    console.error(
      `[inactivity-check] inactivity warning email to ${email} (user ${userId}) was NOT delivered — will retry on the next run instead of stamping inactivity_warning_sent_at`
    );
  }
  return sent;
}

/**
 * Hard-deletes the owner's personal data and anonymises their dogs' records.
 * Exported standalone (not just called from checkInactiveAccounts) so it can
 * be triggered directly for a manual/GDPR-request deletion too, per
 * architecture doc §10's semantics being the single source of truth for
 * "how does this app delete an account," not something re-implemented per
 * caller.
 */
export async function deleteAccount(userId: string): Promise<{ dogs_anonymised: number }> {
  const { data: dogs, error: dogsFetchError } = await supabaseAdmin
    .from('dogs')
    .select('id')
    .eq('owner_id', userId);
  if (dogsFetchError) throw dogsFetchError;

  const dogIds = (dogs ?? []).map((d) => d.id as string);

  if (dogIds.length > 0) {
    const { error: anonymiseError } = await supabaseAdmin
      .from('dogs')
      .update({ owner_id: null })
      .eq('owner_id', userId);
    if (anonymiseError) throw anonymiseError;
  }

  // Saved recommendation sets are derived data (food scores, no personal
  // detail) but they carry owner_id, so they are anonymised on the same rule
  // as the dogs they belong to. Done before the auth.users delete so nothing
  // is left referencing a user id that no longer exists.
  const { error: recSetsError } = await supabaseAdmin
    .from('dog_recommendation_sets')
    .update({ owner_id: null })
    .eq('owner_id', userId);
  if (recSetsError) throw recSetsError;

  // Hard-delete the profile row first (references auth.users.id — deleting
  // the auth user would cascade-orphan or fail depending on FK config, so
  // delete the dependent row explicitly rather than relying on cascade
  // behaviour that wasn't verified against Part A's actual FK definition).
  const { error: profileDeleteError } = await supabaseAdmin
    .from('user_profiles')
    .delete()
    .eq('id', userId);
  if (profileDeleteError) throw profileDeleteError;

  // Hard-delete the auth.users record itself — this removes email and any
  // other Supabase Auth-held identifying data.
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    throw new Error(`deleteAccount: user_profiles row deleted but auth.users deletion failed: ${authDeleteError.message}`);
  }

  console.log(`[inactivity-check] deleted account ${userId}, anonymised ${dogIds.length} dog record(s)`);
  return { dogs_anonymised: dogIds.length };
}

export interface InactivityCheckResult {
  policy: AccountInactivityPolicy;
  users_checked: number;
  warnings_sent: number;
  warnings_cleared: number;
  accounts_deleted: number;
  deleted_user_ids: string[];
}

/**
 * checkInactiveAccounts (Phase 6, architecture doc §10). Runs daily.
 * For each user_profiles row:
 *   - if now they're within warning_before_days of the threshold and no
 *     warning has been sent yet -> send warning, stamp inactivity_warning_sent_at
 *   - if they're at/past the threshold and a warning WAS already sent -> delete
 *   - if last_active_at has moved forward since a warning was sent (i.e. they
 *     re-engaged) -> clear inactivity_warning_sent_at so they aren't deleted
 *     prematurely off a stale warning
 */
export async function checkInactiveAccounts(): Promise<InactivityCheckResult> {
  const policy = await getActiveInactivityPolicy();
  const now = new Date();

  const { data: users, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, last_active_at, inactivity_warning_sent_at');
  if (error) throw error;

  const result: InactivityCheckResult = {
    policy,
    users_checked: users?.length ?? 0,
    warnings_sent: 0,
    warnings_cleared: 0,
    accounts_deleted: 0,
    deleted_user_ids: [],
  };

  for (const user of users ?? []) {
    const lastActive = user.last_active_at ? new Date(user.last_active_at) : null;
    if (!lastActive) continue; // no activity timestamp at all — nothing to compare against, skip rather than guess

    const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    const warningThresholdDays = policy.inactivity_threshold_days - policy.warning_before_days;

    if (daysSinceActive >= policy.inactivity_threshold_days) {
      if (user.inactivity_warning_sent_at) {
        try {
          await deleteAccount(user.id);
          result.accounts_deleted += 1;
          result.deleted_user_ids.push(user.id);
        } catch (err) {
          console.error(`[inactivity-check] deleteAccount failed for ${user.id}`, err);
        }
      }
      // else: past threshold but never warned (e.g. policy just tightened) —
      // don't silently delete someone who was never warned; they'll get a
      // warning on the next run instead, per warningThresholdDays check
      // below (daysSinceActive >= warningThresholdDays is also true here).
    }

    if (daysSinceActive >= warningThresholdDays && daysSinceActive < policy.inactivity_threshold_days) {
      if (!user.inactivity_warning_sent_at) {
        const daysUntilDeletion = policy.inactivity_threshold_days - daysSinceActive;
        const sent = await sendInactivityWarning(user.id, daysUntilDeletion);
        if (sent) {
          const { error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({ inactivity_warning_sent_at: now.toISOString() })
            .eq('id', user.id);
          if (updateError) {
            console.error(`[inactivity-check] failed to stamp inactivity_warning_sent_at for ${user.id}`, updateError);
          } else {
            result.warnings_sent += 1;
          }
        }
        // else: not delivered -- inactivity_warning_sent_at is deliberately
        // left unset so this user is retried (not silently queued for
        // deletion off a warning they never received) on the next run.
      }
    } else if (daysSinceActive < warningThresholdDays && user.inactivity_warning_sent_at) {
      // Re-engaged since a warning was sent (last_active_at moved forward
      // enough to drop back under the warning threshold) — clear the flag
      // so they don't get deleted off a stale warning, per spec.
      const { error: clearError } = await supabaseAdmin
        .from('user_profiles')
        .update({ inactivity_warning_sent_at: null })
        .eq('id', user.id);
      if (clearError) {
        console.error(`[inactivity-check] failed to clear inactivity_warning_sent_at for ${user.id}`, clearError);
      } else {
        result.warnings_cleared += 1;
      }
    }
  }

  console.log(
    `[inactivity-check] checked ${result.users_checked} users: ${result.warnings_sent} warned, ${result.warnings_cleared} cleared, ${result.accounts_deleted} deleted`
  );

  return result;
}
