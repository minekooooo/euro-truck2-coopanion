import { describe, expect, it } from 'vitest';
import { vehicleBrandName, vehicleIdentity } from '../src/vehicles.ts';

describe('vehicle welcome names', () => {
  it('maps common truck brands to Chinese', () => {
    expect(vehicleBrandName('Scania')).toBe('斯堪尼亚');
    expect(vehicleBrandName('Volvo')).toBe('沃尔沃');
    expect(vehicleBrandName('Peterbilt')).toBe('彼得比尔特');
  });

  it('falls back to the raw brand or model', () => {
    expect(vehicleBrandName('Unknown', 'Custom Truck')).toBe('Unknown');
    expect(vehicleBrandName('', 'R 2009')).toBe('R 2009');
  });

  it('uses the unique truck id for first-drive tracking', () => {
    expect(vehicleIdentity('Scania', 'R 2009', 'abc')).toBe('abc');
    expect(vehicleIdentity('Scania', 'R 2009', '')).toBe('scania|r 2009');
  });
});
