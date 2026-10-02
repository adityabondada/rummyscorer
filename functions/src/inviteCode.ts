import { randomInt } from 'node:crypto';
import { COLLECTIONS } from '@rummy/data';
import type { Firestore } from 'firebase-admin/firestore';

// No 0/O or 1/I/L, so a code is easy to read out and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Codes are shown in upper case; accept them with stray spaces, dashes or lower case. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** A code no league is using right now. */
export async function uniqueInviteCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const taken = await db
      .collection(COLLECTIONS.leagues)
      .where('inviteCode', '==', code)
      .limit(1)
      .get();
    if (taken.empty) return code;
  }
  throw new Error('Could not generate a unique invite code');
}
