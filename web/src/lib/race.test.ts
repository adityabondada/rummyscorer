import { describe, expect, it } from 'vitest';
import { DANGER_AT, PULSE_AT, raceView, WARN_AT } from './race';

describe('raceView', () => {
  it('fills the bar in proportion to the score', () => {
    expect(raceView(0, 201, true).pct).toBe(0);
    expect(raceView(100, 200, true).pct).toBe(50);
    expect(raceView(201, 201, true).pct).toBe(100);
  });

  it('is green early on, amber from 60 percent, red from 85', () => {
    expect(raceView(50, 100, true).tone).toBe('safe');
    expect(raceView(WARN_AT - 1, 100, true).tone).toBe('safe');
    expect(raceView(WARN_AT, 100, true).tone).toBe('warn');
    expect(raceView(DANGER_AT - 1, 100, true).tone).toBe('warn');
    expect(raceView(DANGER_AT, 100, true).tone).toBe('danger');
  });

  it('pulses only from 90 percent', () => {
    expect(raceView(PULSE_AT - 1, 100, true).pulse).toBe(false);
    expect(raceView(PULSE_AT, 100, true).pulse).toBe(true);
    expect(raceView(100, 100, true).pulse).toBe(true);
  });

  it('says how many points are left before they go out', () => {
    expect(raceView(55, 201, true).left).toBe(146);
    expect(raceView(0, 50, true).left).toBe(50);
  });

  it('keeps someone exactly on the limit in the game, with a full bar and nothing left', () => {
    const view = raceView(201, 201, true);
    expect(view).toMatchObject({ pct: 100, left: 0, tone: 'danger', pulse: true });
  });

  it('never draws past a full bar, even for a score over the limit', () => {
    expect(raceView(260, 201, true).pct).toBe(100);
    expect(raceView(260, 201, false).pct).toBe(100);
    expect(raceView(260, 201, true).left).toBe(0);
  });

  it('greys out someone who is out, and does not pulse them', () => {
    expect(raceView(260, 201, false)).toMatchObject({ tone: 'out', pulse: false, left: 0 });
    expect(raceView(10, 201, false).tone).toBe('out');
  });

  it('copes with a limit of zero and with a negative score', () => {
    expect(raceView(5, 0, true).pct).toBe(0);
    expect(raceView(-5, 100, true).pct).toBe(0);
  });
});
