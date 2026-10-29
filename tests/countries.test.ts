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
  it('maps a forward crossing to the country on the other side of the node normal', () => {
    const b = book();
    const t = makeTelemetry();
    t.truck.world.x = -100;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = 100;
    const crossing = b.detect(t);
    expect(crossing?.country).toBe('France');
    expect(crossing?.fromCountry).toBe('Deutschland');
    expect(crossing?.direction).toBe('forward');
  });

  it('detects the opposite direction', () => {
    const b = book();
    const t = makeTelemetry();
    t.truck.world.x = 100;
    t.truck.world.z = 0;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = -100;
    expect(b.detect(t)?.country).toBe('Deutschland');
  });

  it('gets the real Sweden→Denmark crossing right', () => {
    const b = new CountryBook(); // packaged borders.json
    const t = makeTelemetry();
    // border_102; normal points toward Denmark.
    const x = 9083.84;
    const z = -26900.652;
    const nx = -0.84269;
    const nz = -0.5384;
    t.truck.world.x = x - nx * 100;
    t.truck.world.z = z - nz * 100;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = x + nx * 100;
    t.truck.world.z = z + nz * 100;
    const crossing = b.detect(t);
    expect(crossing?.country).toBe('Danmark');
    expect(crossing?.fromCountry).toBe('Sverige');
  });

  it('gets the real Luxembourg→France crossing right', () => {
    const b = new CountryBook();
    const t = makeTelemetry();
    // border_78; normal points toward Luxembourg.
    const x = -16317.387;
    const z = 5308.84;
    const nx = -0.41819;
    const nz = -0.90836;
    t.truck.world.x = x + nx * 100;
    t.truck.world.z = z + nz * 100;
    expect(b.detect(t)).toBeNull();
    t.truck.world.x = x - nx * 100;
    t.truck.world.z = z - nz * 100;
    const crossing = b.detect(t);
    expect(crossing?.country).toBe('France');
    expect(crossing?.fromCountry).toBe('Lëtzebuerg');
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
