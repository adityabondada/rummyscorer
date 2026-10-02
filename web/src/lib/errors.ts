/** What the app says when it could not reach the server at all, whatever the technical reason. */
export const UNREACHABLE = "Couldn't reach the server. Check your connection and try again.";

/** Firebase codes that mean the request never got a proper answer from the function. */
const UNREACHABLE_CODES = new Set([
  'unavailable',
  'internal',
  'deadline-exceeded',
  'cancelled',
  'unknown',
]);

/**
 * A sentence to show for a failed call. Our own functions send readable messages (for example "You
 * are not a member of this league"), which pass straight through. Firebase's own failures are
 * mostly the single word "internal" or "Failed to fetch", so those become one plain sentence.
 */
export function errorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code).replace(/^functions\//, '')
      : '';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.replace(/^functions\/[a-z-]+:?\s*/i, '').trim();

  if (code === 'unauthenticated') return 'You have been signed out. Sign in again and retry.';
  if (UNREACHABLE_CODES.has(code)) return UNREACHABLE;
  if (/failed to fetch|network ?error|load failed/i.test(message)) return UNREACHABLE;
  // A bare code as the message ("internal", "not-found") says nothing useful.
  if (message === '' || /^[a-z]+(-[a-z]+)*$/.test(message))
    return 'Something went wrong. Try again.';
  return message;
}
