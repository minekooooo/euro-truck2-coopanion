import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RadarBook } from '../src/radar.ts';
import { makeTelemetry } from './fake-telemetry.ts';

function book(): RadarBook {
  return new RadarBook(join(mkdtempSync(join(tmpdir(), 'ets2-radar-')), 'points.json'), {
    radarRadiusM: 500,
    radarCooldownS: 120,
    radarMinSpeedKmh: 1,
    radarWarnIntervalS: 2,
  });
}

describe('radar book', () => {
  it('loads the packaged map points and warns at a point', () => {
    const r = book();
    expect(r.count).toBeGreaterThan(400);
    const p = r.list()[0]!;
    const t = makeTelemetry();
    t.truck.world.x = p.x;
    t.truck.world.z = p.z;
    t.truck.speedKmh = 50;
    const hit = r.detect(t);
    expect(hit).not.toBeNull();
    expect(hit!.distanceM).toBeLessThan(50);
    expect(r.detect(t)).toBeNull();
  });

  it('records a user point and persists it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ets2-radar-'));
    const path = join(dir, 'points.json');
    const cfg = { radarRadiusM: 500, radarCooldownS: 120, radarMinSpeedKmh: 1, radarWarnIntervalS: 2 };
    const first = new RadarBook(path, cfg);
    const t = makeTelemetry();
    t.truck.world.x = 123;
    t.truck.world.z = 456;
    const p = first.record(t, { type: 'toll', name: '测试收费站', radiusM: 400 });
    expect(p.name).toBe('测试收费站');
    const second = new RadarBook(path, cfg);
    expect(second.count).toBe(first.count);
    expect(second.list().some((x) => x.name === '测试收费站')).toBe(true);
  });
});
