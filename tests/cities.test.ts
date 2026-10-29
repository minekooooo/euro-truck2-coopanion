import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CityBook } from '../src/cities.ts';
import { makeTelemetry } from './fake-telemetry.ts';

function book(): CityBook {
  return new CityBook(join(mkdtempSync(join(tmpdir(), 'ets2-cities-')), 'cities.json'), {
    cityRadiusM: 1500,
  });
}

describe('city geofences', () => {
  it('loads the packaged official city database', () => {
    const b = book();
    expect(b.count).toBeGreaterThan(300);
    expect(b.list().some((p) => p.name === 'Berlin' && p.source === 'map')).toBe(true);
    expect(b.list().find((p) => p.name === 'Amsterdam')?.source).toBe('map');
  });

  it('records a city and announces only after leaving and re-entering', () => {
    const b = book();
    b.record('柏林', 0, 0, 1000, 'manual');
    const t = makeTelemetry();
    t.truck.world.x = 0;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull(); // first tick inside: silent adoption
    expect(b.current?.name).toBe('柏林');
    expect(b.detect(t)).toBeNull();

    t.truck.world.x = 5000;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull();
    expect(b.current).toBeNull();

    t.truck.world.x = 0;
    t.truck.world.z = 0;
    const entered = b.detect(t);
    expect(entered?.name).toBe('柏林');
  });

  it('emits the first entry after starting outside', () => {
    const b = book();
    b.record('测试城', 500000, 500000, 1000, 'manual');
    const t = makeTelemetry();
    t.truck.world.x = 0;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull(); // first tick outside only initializes
    t.truck.world.x = 500000;
    t.truck.world.z = 500000;
    expect(b.detect(t)?.name).toBe('测试城');
  });

  it('does not overwrite a manual city with auto-learning', () => {
    const b = book();
    b.record('柏林', 100, 100, 1200, 'manual');
    b.recordAuto('柏林', 999, 999);
    const point = b.list().find((p) => p.name === '柏林')!;
    expect(point.source).toBe('manual');
    expect(point.x).toBe(100);
  });
});
