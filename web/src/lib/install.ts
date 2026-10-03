import { useEffect, useState } from 'react';

/** The browser's own "install this app" prompt, which Chrome and Edge offer as an event. */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'rummy.installPromptDismissed';

let offered: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/**
 * Starts listening for the install event. It fires once, early, so this runs as the app starts and
 * keeps the event until someone taps Add.
 */
export function captureInstallPrompt(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offered = event as InstallEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    offered = null;
    notify();
  });
}

/** Forgets the captured event, so each test starts clean. */
export function resetInstallPromptForTests(): void {
  offered = null;
  listeners.clear();
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Whether to offer installing, and how: 'prompt' where the browser can show its own install box,
 * 'ios' where it takes Share then Add to Home Screen, or null when there is nothing to offer (already
 * installed, already dismissed, or a browser that can't).
 */
export function useInstallPrompt() {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(() => read(DISMISSED) === '1');
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);

  const kind: 'prompt' | 'ios' | null =
    dismissed || isStandalone() ? null : offered ? 'prompt' : isIos() ? 'ios' : null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Not remembered, so it may show again next time; that is fine.
    }
  };

  const install = async () => {
    const event = offered;
    if (!event) return;
    offered = null;
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    dismiss();
  };

  return { kind, install, dismiss };
}
