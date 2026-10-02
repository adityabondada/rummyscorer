# Rummy Score Tracker

Mobile-first web app for tracking weekend pool Rummy games in a friends' league. Spec: [docs/requirements.md](docs/requirements.md). Working agreements: [CLAUDE.md](CLAUDE.md).

## Layout

- `engine/` — pure game logic (no Firebase imports), tested with Vitest.
- `web/` — React + Vite + Tailwind app.
- `functions/` — Cloud Functions (2nd gen).
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` — Firebase config. Project: `rummytracker-8eab5`.

## Local development

Requires Node 22+ and the Firebase CLI.

```bash
npm install          # install all workspaces
npm run dev          # web dev server
npm run emulators    # Auth, Firestore, Functions, Hosting emulators (demo project, no cloud access)
npm run check        # lint, format check, typecheck, tests
npm run build        # build web and functions
```

Develop against the emulators only; never write to the production Firestore from a dev machine.
