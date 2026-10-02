import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';

describe('DEFAULT_SETTINGS', () => {
  it('matches the spec defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      limit: 201,
      buyIn: 10,
      dropPoints: 20,
      middleDropPoints: 40,
      maxDrops: 2,
      dropsOnRejoin: { mode: 'grant', count: 0 },
      maxRoundPenalty: 80,
      rejoinCutoff: null,
    });
  });
});
