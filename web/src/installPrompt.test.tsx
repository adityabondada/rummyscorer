// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt';
import { captureInstallPrompt, resetInstallPromptForTests } from './lib/install';

/** A stand-in for the browser's install event, which Chrome sends once. */
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

const standalone = (on: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(
      (query: string) => ({ matches: on && query.includes('standalone') }) as MediaQueryList,
    );

beforeEach(() => {
  resetInstallPromptForTests();
  localStorage.clear();
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as never;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux) Chrome/130');
  captureInstallPrompt(window);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the install prompt', () => {
  it('shows nothing when the browser has not offered to install and it is not an iPhone', () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Add to home screen' })).not.toBeInTheDocument();
  });

  it('shows an Add button once the browser offers to install, and keeps the offer for later', async () => {
    window.dispatchEvent(installEvent());
    render(<InstallPrompt />);
    expect(await screen.findByRole('button', { name: 'Add to home screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('shows it when the offer arrives after the page has drawn', async () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('button', { name: 'Add to home screen' })).not.toBeInTheDocument();
    act(() => void window.dispatchEvent(installEvent()));
    expect(await screen.findByRole('button', { name: 'Add to home screen' })).toBeInTheDocument();
  });

  it('keeps the browser from showing its own bar, so ours is the one that asks', () => {
    const event = installEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('opens the browser install box when Add is tapped, then goes away for good', async () => {
    const event = installEvent();
    window.dispatchEvent(event);
    render(<InstallPrompt />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Add to home screen' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add to home screen' })).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem('rummy.installPromptDismissed')).toBe('1');
  });

  it('goes away, and stays away on the next visit, after Not now', async () => {
    window.dispatchEvent(installEvent());
    const { unmount } = render(<InstallPrompt />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    unmount();

    window.dispatchEvent(installEvent());
    render(<InstallPrompt />);
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
  });

  it('is left out once the app is installed and opened from the home screen', () => {
    standalone(true);
    window.dispatchEvent(installEvent());
    render(<InstallPrompt />);
    expect(screen.queryByRole('button', { name: 'Add to home screen' })).not.toBeInTheDocument();
  });

  it('disappears when the browser says the app was installed', async () => {
    window.dispatchEvent(installEvent());
    render(<InstallPrompt />);
    await screen.findByRole('button', { name: 'Add to home screen' });
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(screen.queryByRole('button', { name: 'Add to home screen' })).not.toBeInTheDocument();
  });

  it('still works when the browser will not let the choice be remembered', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    window.dispatchEvent(installEvent());
    render(<InstallPrompt />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
  });
});

describe('the install prompt on an iPhone', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1',
    );
  });

  it('explains Share then Add to Home Screen, since Safari has no install button', () => {
    render(<InstallPrompt />);
    expect(screen.getByText(/Tap the Share button, then “Add to Home Screen”/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to home screen' })).not.toBeInTheDocument();
  });

  it('can be dismissed with Got it, and stays dismissed', async () => {
    const { unmount } = render(<InstallPrompt />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Share button/)).not.toBeInTheDocument();
    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByText(/Share button/)).not.toBeInTheDocument();
  });

  it('is left out when already opened from the home screen', () => {
    standalone(true);
    render(<InstallPrompt />);
    expect(screen.queryByText(/Share button/)).not.toBeInTheDocument();
  });
});
