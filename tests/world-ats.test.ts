import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ets2World } from '../src/world.ts';
import { ETS2_DEFAULTS } from '../src/config.ts';

describe('World dataset switching', () => {
  it('switches all books from ETS2 to ATS and back', () => {
    const world = new Ets2World({
      cfg: { ...ETS2_DEFAULTS },
      dataDir: mkdtempSync(join(tmpdir(), 'ets2-world-ats-')),
      timezone: 'Asia/Hong_Kong',
    });
    const internal = world as unknown as {
      applyGame(game: number): void;
      game: string;
      cities: { count: number };
      radar: { count: number };
      countries: { count: number };
    };
    expect(internal.game).toBe('ets2');
    expect(internal.cities.count).toBe(380);
    expect(internal.radar.count).toBe(415);
    internal.applyGame(2);
    expect(internal.game).toBe('ats');
    expect(internal.cities.count).toBe(270);
    expect(internal.radar.count).toBe(541);
    expect(internal.countries.count).toBe(229);
    expect(world.envPromptVars()?.['game.title']).toBe('美国卡车模拟');
    expect(world.envPromptVars()?.['game.short']).toBe('ATS');
    internal.applyGame(1);
    expect(internal.game).toBe('ets2');
    expect(internal.cities.count).toBe(380);
  });
});
