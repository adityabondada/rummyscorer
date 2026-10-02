import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  COLLECTIONS,
  gamePath,
  gamesPath,
  leaguePath,
  parseGame,
  parseLeague,
  parsePlayer,
  parseRound,
  parseSettled,
  playersPath,
  roundsPath,
  settledPath,
  type GameDoc,
  type LeagueDoc,
  type SettledDoc,
} from '@rummy/data';
import type { GameState } from '@rummy/engine';
import { EngineError } from '@rummy/engine';
import { db } from './firebase';
import { gameState, type PlayerMap, type RoundRow } from './lib/game';
import { pickablePlayers } from './lib/names';
import type { GameRow } from './lib/night';

export interface Loaded<T> {
  value: T;
  loading: boolean;
  error: string | null;
}

function useSnapshot<T>(
  key: string | null,
  make: (() => Query<DocumentData> | null) | null,
  parse: (rows: { id: string; data: unknown }[]) => T,
  empty: T,
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({
    value: empty,
    loading: key !== null,
    error: null,
  });

  useEffect(() => {
    const q = make?.();
    if (!key || !q) {
      setState({ value: empty, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      q,
      (snap) => {
        setState({
          value: parse(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
          loading: false,
          error: null,
        });
      },
      (error) => setState({ value: empty, loading: false, error: error.message }),
    );
    // `make` and `parse` are recreated each render but only depend on `key`.
  }, [key]);

  return state;
}

/** Parses documents, skipping any that don't have the expected shape rather than breaking the screen. */
function parseEach<T>(rows: { id: string; data: unknown }[], parse: (data: unknown) => T) {
  const out: { id: string; data: T }[] = [];
  for (const row of rows) {
    try {
      out.push({ id: row.id, data: parse(row.data) });
    } catch (error) {
      console.warn(`Skipping malformed document ${row.id}`, error);
    }
  }
  return out;
}

export interface LeagueRow {
  id: string;
  doc: LeagueDoc;
}

/** The leagues a user belongs to. */
export function useMyLeagues(uid: string): Loaded<LeagueRow[]> {
  return useSnapshot(
    uid,
    () => query(collection(db, COLLECTIONS.leagues), where('memberUids', 'array-contains', uid)),
    (rows) =>
      parseEach(rows, parseLeague)
        .map((r) => ({ id: r.id, doc: r.data }))
        .sort((a, b) => a.doc.name.localeCompare(b.doc.name)),
    [],
  );
}

/**
 * How many players each league has, live: the people who could be picked for a game (not retired,
 * and guests merged into a member counted once). A league shows no number until it has loaded,
 * or if it can't be read.
 */
export function usePlayerCounts(leagueIds: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = [...leagueIds].sort().join(',');

  useEffect(() => {
    const ids = key === '' ? [] : key.split(',');
    // Forget leagues that are no longer in the list.
    setCounts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => ids.includes(id))),
    );
    const unsubscribe = ids.map((id) =>
      onSnapshot(
        collection(db, playersPath(id)),
        (snap) => {
          const players: PlayerMap = Object.fromEntries(
            parseEach(
              snap.docs.map((d) => ({ id: d.id, data: d.data() })),
              parsePlayer,
            ).map((r) => [r.id, r.data]),
          );
          setCounts((prev) => ({ ...prev, [id]: pickablePlayers(players).length }));
        },
        () =>
          setCounts((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id))),
      ),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [key]);

  return counts;
}

export function useLeague(leagueId: string | null): Loaded<LeagueDoc | null> {
  const [state, setState] = useState<Loaded<LeagueDoc | null>>({
    value: null,
    loading: leagueId !== null,
    error: null,
  });
  useEffect(() => {
    if (!leagueId) return;
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      doc(db, leaguePath(leagueId)),
      (snap) => {
        try {
          setState({
            value: snap.exists() ? parseLeague(snap.data()) : null,
            loading: false,
            error: null,
          });
        } catch (error) {
          setState({ value: null, loading: false, error: String(error) });
        }
      },
      (error) => setState({ value: null, loading: false, error: error.message }),
    );
  }, [leagueId]);
  return state;
}

export function usePlayers(leagueId: string): Loaded<PlayerMap> {
  return useSnapshot(
    leagueId,
    () => collection(db, playersPath(leagueId)),
    (rows) => Object.fromEntries(parseEach(rows, parsePlayer).map((r) => [r.id, r.data])),
    {},
  );
}

/** A league's games, newest first. */
export function useGames(leagueId: string): Loaded<GameRow[]> {
  return useSnapshot(
    leagueId,
    () => collection(db, gamesPath(leagueId)),
    (rows) =>
      parseEach(rows, parseGame)
        .map((r) => ({ id: r.id, doc: r.data }))
        .sort((a, b) => b.doc.createdAt - a.doc.createdAt),
    [],
  );
}

/** Payments marked as paid, by record id. */
export function useSettled(leagueId: string): Loaded<Record<string, SettledDoc>> {
  return useSnapshot(
    leagueId,
    () => collection(db, settledPath(leagueId)),
    (rows) => Object.fromEntries(parseEach(rows, parseSettled).map((r) => [r.id, r.data])),
    {},
  );
}

export interface LiveGame {
  game: GameDoc | null;
  rows: RoundRow[];
  state: GameState | null;
  /** Why the rounds can't be replayed, if they can't. */
  problem: string | null;
  loading: boolean;
  error: string | null;
}

/** One game with its rounds, kept live, and the state the engine derives from them. */
export function useLiveGame(leagueId: string, gameId: string, players: PlayerMap): LiveGame {
  const [game, setGame] = useState<Loaded<GameDoc | null>>({
    value: null,
    loading: true,
    error: null,
  });
  useEffect(
    () =>
      onSnapshot(
        doc(db, gamePath(leagueId, gameId)),
        (snap) => {
          try {
            setGame({
              value: snap.exists() ? parseGame(snap.data()) : null,
              loading: false,
              error: null,
            });
          } catch (error) {
            setGame({ value: null, loading: false, error: String(error) });
          }
        },
        (error) => setGame({ value: null, loading: false, error: error.message }),
      ),
    [leagueId, gameId],
  );

  const rounds = useSnapshot(
    `${leagueId}/${gameId}`,
    () => collection(db, roundsPath(leagueId, gameId)),
    (rows) => parseEach(rows, parseRound).map((r) => ({ id: r.id, doc: r.data })),
    [] as RoundRow[],
  );

  const derived = useMemo(() => {
    if (!game.value) return { state: null, problem: null };
    try {
      return { state: gameState(game.value, rounds.value, players), problem: null };
    } catch (error) {
      if (error instanceof EngineError) return { state: null, problem: error.message };
      throw error;
    }
  }, [game.value, rounds.value, players]);

  return {
    game: game.value,
    rows: rounds.value,
    ...derived,
    loading: game.loading || rounds.loading,
    error: game.error ?? rounds.error,
  };
}
