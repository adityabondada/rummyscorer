import { describe, expect, it } from 'vitest';
import { errorMessage, UNREACHABLE } from './errors';

const firebaseError = (code: string, message: string) =>
  Object.assign(new Error(message), { code: `functions/${code}` });

describe('errorMessage', () => {
  it('passes our own readable messages straight through', () => {
    expect(
      errorMessage(firebaseError('permission-denied', 'You are not a member of this league')),
    ).toBe('You are not a member of this league');
    expect(errorMessage(firebaseError('not-found', 'That game does not exist'))).toBe(
      'That game does not exist',
    );
    expect(
      errorMessage(
        firebaseError(
          'failed-precondition',
          "Both profiles played in the same game (g1), so they can't be merged",
        ),
      ),
    ).toContain('same game');
  });

  it('says plainly when the server could not be reached', () => {
    for (const code of ['unavailable', 'internal', 'deadline-exceeded', 'cancelled', 'unknown']) {
      expect(errorMessage(firebaseError(code, code))).toBe(UNREACHABLE);
    }
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(UNREACHABLE);
    expect(errorMessage(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      UNREACHABLE,
    );
  });

  it('tells someone who has been signed out to sign in again', () => {
    expect(errorMessage(firebaseError('unauthenticated', 'Sign in first'))).toMatch(/signed out/);
  });

  it('does not show a bare error code as if it were a message', () => {
    expect(errorMessage(new Error('internal'))).toBe('Something went wrong. Try again.');
    expect(errorMessage(new Error('not-found'))).toBe('Something went wrong. Try again.');
    expect(errorMessage(new Error('functions/not-found'))).toBe('Something went wrong. Try again.');
  });

  it('handles odd values without throwing', () => {
    expect(errorMessage(undefined)).toBe('Something went wrong. Try again.');
    expect(errorMessage(null)).toBe('Something went wrong. Try again.');
    expect(errorMessage('plain text failure')).toBe('plain text failure');
    expect(errorMessage(new Error(''))).toBe('Something went wrong. Try again.');
  });

  it('strips the functions/ prefix some versions leave on the message', () => {
    expect(
      errorMessage(new Error('functions/permission-denied: Only the league admin can do this')),
    ).toBe('Only the league admin can do this');
  });
});
