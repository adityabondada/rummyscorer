import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { captureInstallPrompt } from './lib/install';
import './index.css';

// Updates the cached app files in the background; the new version is used the next time it opens.
registerSW({ immediate: true });

// Chrome offers the install prompt once, early; keep it for the Add button.
captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
