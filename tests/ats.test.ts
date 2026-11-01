import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CityBook } from '../src/cities.ts';
import { CountryBook } from '../src/countries.ts';
import { gameKind } from '../src/game.ts';
import { RadarBook } from '../src/radar.ts';
import { makeTelemetry } from './fake-telemetry.ts';

const assets = (name: string) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const cfg = {
  cityRadiusM: 1500,
  cityAnnounceEnabled: true,
  cityLearnEnabled: true,
  cityRepeatIntro: false,
  radarEnabled: true,
  radarRadiusM: 500,
  radarCooldownS: 120,
  radarMinSpeedKmh: 10,
  radarWarnIntervalS: 90,
};
const user = () => join(mkdtempSync(join(tmpdir(), 'ets2-ats-test-')), 'user.json');

describe('ATS datasets', () => {
  it('recognizes the ATS game id', () => {
    expect(gameKind(1)).toBe('ets2');
    expect(gameKind(2)).toBe('ats');
  });

  it('loads the ATS city database', () => {
    const b = new CityBook(user(), cfg, assets('cities_ats.json'));
    expect(b.count).toBe(270);
    expect(b.list().some((c) => c.token === 'austin')).toBe(true);
  });

  it('loads the ATS radar database', () => {
    const b = new RadarBook(user(), cfg, assets('radar_points_ats.json'));
    expect(b.count).toBe(541);
    expect(b.list().some((p) => p.type === 'weigh')).toBe(true);
  });

  it('loads ATS state borders and keeps the ETS2 direction convention', () => {
    const b = new CountryBook(assets('borders_ats.json'));
    expect(b.count).toBe(229);
    const border = b.list().find((x) => x.forwardName === 'Kansas' && x.backwardName === 'Oklahoma');
    expect(border).toBeDefined();
    const t = makeTelemetry();
    t.truck.world.x = border!.x - border!.nx * 100;
    t.truck.world.z = border!.z - border!.nz * 100;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = border!.x + border!.nx * 100;
    t.truck.world.z = border!.z + border!.nz * 100;
    expect(b.detect(t)?.country).toBe('Oklahoma');
  });
});
