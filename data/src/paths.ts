export const COLLECTIONS = {
  leagues: 'leagues',
  players: 'players',
  games: 'games',
  rounds: 'rounds',
  log: 'log',
  settled: 'settled',
} as const;

export const leaguePath = (leagueId: string) => `${COLLECTIONS.leagues}/${leagueId}`;
export const playersPath = (leagueId: string) => `${leaguePath(leagueId)}/${COLLECTIONS.players}`;
export const playerPath = (leagueId: string, playerId: string) =>
  `${playersPath(leagueId)}/${playerId}`;
export const gamesPath = (leagueId: string) => `${leaguePath(leagueId)}/${COLLECTIONS.games}`;
export const gamePath = (leagueId: string, gameId: string) => `${gamesPath(leagueId)}/${gameId}`;
export const roundsPath = (leagueId: string, gameId: string) =>
  `${gamePath(leagueId, gameId)}/${COLLECTIONS.rounds}`;
export const roundPath = (leagueId: string, gameId: string, roundId: string) =>
  `${roundsPath(leagueId, gameId)}/${roundId}`;
export const logPath = (leagueId: string) => `${leaguePath(leagueId)}/${COLLECTIONS.log}`;
export const settledPath = (leagueId: string) => `${leaguePath(leagueId)}/${COLLECTIONS.settled}`;

/** The id of the "paid" record for one payment on one night. Matches what the rules require. */
export const settledKey = (day: string, from: string, to: string, amount: number) =>
  `${day}_${from}_${to}_${amount}`;
