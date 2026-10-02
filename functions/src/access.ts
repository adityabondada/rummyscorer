import {
  leaguePath,
  parseLeague,
  type LeagueDoc,
  type LogEntryDoc,
  type LogType,
} from '@rummy/data';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export async function readLeague(
  tx: Transaction,
  db: Firestore,
  leagueId: string,
): Promise<LeagueDoc> {
  const snap = await tx.get(db.doc(leaguePath(leagueId)));
  if (!snap.exists) throw new HttpsError('not-found', 'League not found');
  return parseLeague(snap.data());
}

export function requireMember(league: LeagueDoc, uid: string): void {
  if (!league.memberUids.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a member of this league');
  }
}

export function requireAdmin(league: LeagueDoc, uid: string): void {
  if (league.adminUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the league admin can do this');
  }
}

/** A non-empty string argument of at most `max` characters, trimmed. */
export function stringArg(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${name} must be 1 to ${max} characters`);
  }
  return value.trim();
}

export function logEntry(
  type: LogType,
  by: string,
  at: number,
  details: LogEntryDoc['details'],
): LogEntryDoc {
  return { type, by, at, details };
}
