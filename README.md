# Rummy Score Tracker

Mobile-first web app for tracking weekend pool Rummy games in a friends' league. Spec: [docs/requirements.md](docs/requirements.md). Working agreements: [CLAUDE.md](CLAUDE.md).

## Layout

- `engine/` — pure game logic (no Firebase imports), tested with Vitest.
- `data/` — Firestore document types, parsers, round history helpers and summary builder; also the rules tests.
- `web/` — React + Vite + Tailwind app.
- `functions/` — Cloud Functions (2nd gen). Built with esbuild into one bundle (`lib/index.js`) that includes `engine` and `data`; only `firebase-admin` and `firebase-functions` are installed at deploy time.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` — Firebase config. Project: `rummytracker-8eab5`.

## Local development

Requires Node 22+, the Firebase CLI, and Java 21+ for the Firestore emulator.

```bash
npm install          # install all workspaces
npm run dev          # web dev server
npm run emulators    # Auth, Firestore, Functions, Hosting emulators (demo project, no cloud access)
npm run check        # lint, format check, typecheck, tests
npm run test:rules   # Firestore rules tests (starts the emulator; needs Java 21+)
npm run test:functions  # function logic against the Firestore emulator
npm run test:e2e     # builds functions, then runs callables and triggers in the full emulator suite
npm run build        # build web and functions
```

Develop against the emulators only; never write to the production Firestore from a dev machine.
