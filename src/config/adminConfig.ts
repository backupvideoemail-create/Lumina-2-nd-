/**
 * AI PRIME STUDIO — AUTHORITATIVE SERVER ADMIN CONFIGURATION
 * Single Authoritative Source of Truth for Administrator Allowlist.
 * Both backend middleware (server.ts) and database identity mapping (database.ts)
 * MUST import from this file to eliminate configuration drift.
 */

export const AUTHORIZED_ADMIN_EMAILS = [
  'backupvideoemail@gmail.com',
  'ai.prime.studio.pro@gmail.com'
] as const;

export type AuthorizedAdminEmail = typeof AUTHORIZED_ADMIN_EMAILS[number];

/**
 * Validates whether an email string strictly belongs to the authoritative admin allowlist.
 * Case-insensitive, whitespace-trimmed, and rejects null/empty/undefined.
 */
export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.toLowerCase().trim();
  return AUTHORIZED_ADMIN_EMAILS.includes(normalized as AuthorizedAdminEmail);
}
