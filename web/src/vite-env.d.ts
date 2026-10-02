/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** "true" or "false". Defaults to true in dev when no API key is configured. */
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FUNCTIONS_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
