export interface EntitlementSubject {
  status?: string | null;
  paidThroughAt?: unknown;
}

/**
 * Pure, environment-neutral subscription entitlement evaluator shared by backend routes and client UI.
 *
 * Rules:
 * - Missing subscription or terminal/inactive statuses ('revoked', 'paused', 'expired') always return false.
 * - When `paidThroughAt` is present and non-empty:
 *   - Must be a valid finite timestamp strictly greater than `nowMs` (`paidThroughAt <= nowMs` returns false for ALL statuses including 'active' and 'trial').
 *   - Invalid non-empty timestamps fail closed (return false).
 * - When `paidThroughAt` is genuinely missing (undefined, null, or empty string):
 *   - Retains documented legacy compatibility ONLY for 'active' and 'trial'.
 */
export function isSubscriptionEntitled(
  sub: EntitlementSubject | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!sub) return false;
  if (sub.status === 'revoked' || sub.status === 'paused' || sub.status === 'expired') {
    return false;
  }

  const rawPaidThrough = sub.paidThroughAt;
  const isMissingPaidThrough =
    rawPaidThrough === undefined || rawPaidThrough === null || rawPaidThrough === '';

  if (!isMissingPaidThrough) {
    if (typeof rawPaidThrough !== 'string' || rawPaidThrough.trim().length === 0) {
      return false;
    }
    const paidThroughMs = Date.parse(rawPaidThrough);
    if (!Number.isFinite(paidThroughMs) || paidThroughMs <= nowMs) {
      return false;
    }
    return (
      sub.status === 'active' ||
      sub.status === 'trial' ||
      sub.status === 'cancelled' ||
      sub.status === 'past_due' ||
      sub.status === 'on_hold' ||
      sub.status === 'grace_period' ||
      sub.status === 'payment_failed'
    );
  }

  return sub.status === 'active' || sub.status === 'trial';
}
