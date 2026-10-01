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

### Trying the web app locally

Run the emulators and the dev server in two terminals:

```bash
npm run build --workspace functions   # the emulator runs the built bundle
firebase emulators:start --only auth,firestore,functions --project demo-rummytracker
```

```bash
npm run dev                           # http://localhost:5173
```

With no API key configured, the app talks to the emulators. The sign-in page then also offers
"Sign in as tester", so you can try the app as several made-up people without a Google account (sign out
and back in as another name to be a second member). To use the real project instead, copy
`web/.env.example` to `web/.env.local` and fill in the web app config from the Firebase console.

To fill the emulator with a demo league (five players and 14 finished games over several months, so the
Stats tab has something to show), run this once the emulators are up, then sign in as the tester "Asha":

```bash
npm run seed:demo
```

It only talks to the emulators and cannot touch the real project.

Rebuild the functions bundle after changing `functions/`, `engine/` or `data/`; the emulator does not
rebuild it for you.
