import { DEFAULT_SETTINGS } from '@rummy/engine';

export function App() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-semibold">Rummy Score Tracker</h1>
      <p className="mt-2 text-sm text-gray-600">Default limit: {DEFAULT_SETTINGS.limit}</p>
    </main>
  );
}
