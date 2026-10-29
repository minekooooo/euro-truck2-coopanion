import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CountryBook } from '../src/countries.ts';
import { makeTelemetry } from './fake-telemetry.ts';

function book(): CountryBook {
  const path = join(mkdtempSync(join(tmpdir(), 'ets2-borders-')), 'borders.json');
  writeFileSync(path, JSON.stringify({
    version: 1,
    borders: [{
      id: 'test_border',
      x: 0,
      z: 0,
      nx: 1,
      nz: 0,
      forwardCountry: 5,
      backwardCountry: 4,
      forwardName: 'Deutschland',
      backwardName: 'France',
      source: 'test',
    }],
  }));
  return new CountryBook(path, 80);
}

describe('country border crossings', () => {
  it('detects a forward crossing after the previous position is established', () => {
    const b = book();
    const t = makeTelemetry();
    t.truck.world.x = -100;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = 100;
    const crossing = b.detect(t);
    expect(crossing?.country).toBe('Deutschland');
    expect(crossing?.fromCountry).toBe('France');
    expect(crossing?.direction).toBe('forward');
  });

  it('detects the opposite direction', () => {
    const b = book();
    const t = makeTelemetry();
    t.truck.world.x = 100;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = -100;
    expect(b.detect(t)?.country).toBe('France');
  });

  it('ignores teleport-sized jumps', () => {
    const b = book();
    const t = makeTelemetry();
    t.truck.world.x = -2000;
    t.truck.world.z = 0;
    b.detect(t);
    t.truck.world.x = 2000;
    expect(b.detect(t)).toBeNull();
  });
});
