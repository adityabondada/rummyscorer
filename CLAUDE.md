# Rummy Score Tracker

Mobile-first web app for tracking weekend pool Rummy games in a friends' league. Full spec: `docs/requirements.md` — read it before starting any task.

## Stack

- TypeScript everywhere, npm workspaces monorepo.
- `engine/` — pure game logic (no Firebase imports), Vitest tests.
- `data/` — Firestore document types, parsers, round history helpers, summary builder, and rules tests (`npm run test:rules`).
- `web/` — React + Vite + Tailwind, PWA, Recharts, Firebase JS SDK (modular).
- `functions/` — Cloud Functions for Firebase (2nd gen, Node LTS), uses `engine`.
- Firebase: Auth (Google), Firestore, Hosting, Functions. Project is on the Blaze plan; keep usage within no-cost quotas.

## Core design rule

Game state is always **derived**, never stored incrementally. `engine` replays settings + ordered non-scrapped rounds to produce totals, drops remaining, eliminations, rejoins, dealer, pot, winner and settlement. Web and functions both use the same `engine` so they can never disagree.

Player merges never rewrite rounds. A merged guest has `mergedInto` set; the engine takes a `resolveId` function to map ids, and `onRoundWrite` bakes resolved ids into game summaries so stats never see unresolved ids.

## Conventions

- Small, focused commits. One branch and one pull request per phase below.
- Every engine rule gets a unit test, including full replays of realistic games (rejoins, drops, scraps, splits).
- Run lint, typecheck and tests before every commit.
- Develop and test against the Firebase Emulator Suite. Never write to the production Firestore during development.
- Keep Firestore reads cheap: stats read cached game summaries, not every round.

## Guardrails for unattended work

- Do NOT deploy to production, change IAM, billing, or Firebase project settings without asking first.
- Do NOT merge pull requests; open them and leave them for review.
- Where the spec has an open question, implement the stated default behind a clearly named setting or constant, add a `TODO(open-question)` comment, and list it in the PR description.
- If blocked on credentials or a decision, stop and summarise what's needed rather than guessing.

## Build plan

1. **Scaffold** — workspaces, TypeScript config, lint/format, Vitest, `firebase.json`, emulator config, README with local dev commands.
2. **Engine** — settings, seating and dealer rotation, round entry, drops and max drops, elimination, rejoin (between rounds only; entry score = highest active + 1; optional `rejoinCutoff`; "Drops on rejoin" setting), per-round penalty cap (`maxRoundPenalty`, default 80), exactly one winner per round, outright win, split suggestion (`suggestSplit()`, weight = distance from limit + dropsLeft × dropPoints), settlement with minimal transfers, scrapping from the end. Exhaustive tests.
3. **Data layer and rules** — Firestore types, converters, security rules (members only), rules tests against the emulator.
4. **Cloud Functions** — `joinLeague`, `mergePlayers`, `unmergePlayers`, `onRoundWrite` (game summary), `removeMember`, `regenerateInvite`. Emulator tests.
5. **Web app** — sign-in, league create/join, players and guests, new game setup and seating, live round entry, scrap/restore, game summary and settlement.
6. **Stats** — leaderboard and trends with time filter.
7. **CI** — GitHub Actions for PR checks + Hosting preview, and production deploy on merge. Document the Workload Identity Federation setup steps for the owner to run; don't perform IAM changes yourself.
