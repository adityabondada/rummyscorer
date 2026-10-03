import { useEffect, useState } from 'react';
import { inviteInfo } from '../api';

/** What is known about an invite link: loading, a real league, a dead link, or couldn't check. */
export type InviteState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ok'; leagueName: string; members: number }
  | { status: 'invalid' }
  | { status: 'error' };

/** "1 person" or "5 people". */
export const peopleLabel = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === 'functions/not-found';

/**
 * Looks up the league an invite code belongs to, with no sign-in needed. An empty code looks
 * nothing up ('none'). A dead or replaced link
 * comes back as 'invalid'. If the check itself fails (no signal), it says 'error' so the page can
 * carry on without the league's name instead of blocking anyone.
 */
export function useInvite(code: string): InviteState {
  const [state, setState] = useState<InviteState>({ status: code ? 'loading' : 'none' });
  useEffect(() => {
    if (!code) {
      setState({ status: 'none' });
      return;
    }
    let current = true;
    setState({ status: 'loading' });
    inviteInfo({ code }).then(
      (info) => current && setState({ status: 'ok', ...info }),
      (error) => current && setState({ status: isNotFound(error) ? 'invalid' : 'error' }),
    );
    return () => {
      current = false;
    };
  }, [code]);
  return state;
}
