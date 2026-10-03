import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '@rummy/engine';
import { errorMessage, shareGame } from '../../api';
import { copyText, gameShareText, shareOrCopy, viewUrl } from '../../lib/share';
import { buildGameCard, renderGameCard, shareImage } from '../../lib/shareImage';
import { Button, ErrorText, Modal } from '../../ui';

type Picture =
  { status: 'making' } | { status: 'ready'; blob: Blob; url: string } | { status: 'failed' };

/**
 * Two ways to bring the rest of the table in: one Share button that sends the scores to a chat as a
 * picture (as text only where the browser can't draw it), and a link anyone can open to watch the
 * game without signing in. The link can be turned off at any time.
 */
export function ShareModal({
  leagueId,
  gameId,
  leagueName,
  state,
  names,
  startedAt,
  shareCode,
  onClose,
}: {
  leagueId: string;
  gameId: string;
  leagueName: string;
  state: GameState;
  names: Record<string, string>;
  /** When the game was started, for the date on the picture. */
  startedAt?: number | null;
  /** The game's link while it is switched on. */
  shareCode: string | null | undefined;
  onClose: () => void;
}) {
  // Kept here too, so the link shows the moment it is made, before the game document catches up.
  const [made, setMade] = useState<{ code: string | null } | null>(null);
  const code = made ? made.code : (shareCode ?? null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const link = code ? viewUrl(code) : null;
  // Watching live is for a game being played. A finished game only shows it if a link is still on,
  // so that it can be turned off.
  const showLive = state.status !== 'finished' || link !== null;

  // The picture is drawn as soon as the window opens, so it can be seen before it is sent.
  const model = useMemo(
    () => buildGameCard({ leagueName, state, names, startedAt }),
    [leagueName, state, names, startedAt],
  );
  const [picture, setPicture] = useState<Picture>({ status: 'making' });
  useEffect(() => {
    let current = true;
    let url: string | null = null;
    setPicture({ status: 'making' });
    renderGameCard(model).then(
      (blob) => {
        if (!current) return;
        url = URL.createObjectURL(blob);
        setPicture({ status: 'ready', blob, url });
      },
      () => current && setPicture({ status: 'failed' }),
    );
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [model]);

  const sendPicture = async () => {
    if (picture.status !== 'ready') return;
    setError('');
    const slug = leagueName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    try {
      const result = await shareImage(
        picture.blob,
        `${slug || 'rummy'}-scores.png`,
        `${leagueName} scores`,
      );
      setNote(
        result === 'shared'
          ? 'Shared'
          : result === 'saved'
            ? 'Saved to your device. Attach it to your chat.'
            : '',
      );
    } catch {
      setError("Couldn't share the picture. Try again.");
    }
  };

  const sendText = async () => {
    setError('');
    const text = gameShareText({ leagueName, state, names, url: link });
    const result = await shareOrCopy(`${leagueName} scores`, text);
    setNote(
      result === 'copied'
        ? 'Copied. Paste it into your chat.'
        : result === 'shared'
          ? 'Shared'
          : '',
    );
    if (result === 'failed') setError("Couldn't share or copy. Try again.");
  };

  const copyLink = async () => {
    setError('');
    if (link && (await copyText(link))) setNote('Link copied');
    else setError('Copy failed. Select the link and copy it by hand.');
  };

  const setLink = async (enable: boolean) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const result = await shareGame({ leagueId, gameId, enable });
      setMade({ code: result.shareCode });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Share this game" onClose={onClose}>
      <div className="space-y-4">
        <section className="space-y-2">
          <h3 className="font-medium">Send the scores</h3>
          <p className="text-sm text-slate-600">
            {state.status === 'finished'
              ? 'A picture of who won, the nets, and who pays whom, ready for your group chat.'
              : 'A picture of the standings so far, ready for your group chat.'}
          </p>
          {picture.status === 'ready' && (
            <img
              src={picture.url}
              alt={`Picture of the ${state.status === 'finished' ? 'final' : 'current'} scores, as it will be shared`}
              className="mx-auto max-h-72 rounded-lg ring-1 ring-slate-200"
            />
          )}
          {picture.status === 'making' && (
            <p role="status" className="text-sm text-slate-500">
              Making the picture…
            </p>
          )}
          {picture.status === 'failed' && (
            <p className="text-sm text-slate-600">
              This browser can't make the picture, so the scores will be shared as text.
            </p>
          )}
          <Button
            className="w-full"
            disabled={picture.status === 'making'}
            onClick={() => void (picture.status === 'ready' ? sendPicture() : sendText())}
          >
            Share
          </Button>
        </section>

        {showLive && (
          <section className="space-y-2 border-t border-slate-100 pt-4">
            <h3 className="font-medium">Live view link</h3>
            <p className="text-sm text-slate-600">
              Anyone with the link can watch the scores as they change, without signing in. They
              can't change anything. Turn it off whenever you like.
            </p>
            {link ? (
              <>
                <p
                  className="break-all rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  data-testid="view-link"
                >
                  {link}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => void copyLink()}>
                    Copy link
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void setLink(false)}
                  >
                    Turn off
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => void setLink(true)}
              >
                {busy ? 'Making the link…' : 'Create a live view link'}
              </Button>
            )}
          </section>
        )}

        {note && (
          <p role="status" className="text-sm text-emerald-700">
            {note}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
