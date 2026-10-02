import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const env = import.meta.env;

/**
 * In dev, talk to the local Firebase emulators unless a real project is configured (an API key in
 * `web/.env.local`). Set VITE_USE_EMULATORS to "true" or "false" to force it either way.
 */
export const useEmulators: boolean = env.VITE_USE_EMULATORS
  ? env.VITE_USE_EMULATORS === 'true'
  : env.DEV && !env.VITE_FIREBASE_API_KEY;

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'demo-rummytracker.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'demo-rummytracker',
  appId: env.VITE_FIREBASE_APP_ID ?? 'demo-app',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
// TODO(open-question): keep in step with the region functions are deployed to (see functions/src/index.ts).
export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION ?? 'us-central1');

if (useEmulators) {
  const host = window.location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
