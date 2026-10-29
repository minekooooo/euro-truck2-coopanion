import { describe, expect, it } from 'vitest';
import { makeTelemetry } from './fake-telemetry.ts';

describe('SCS telemetry parser', () => {
  it('reads the key fields at the 1.12 offsets', () => {
    const t = makeTelemetry();
    expect(t.rawOk).toBe(true);
    expect(t.dllVersion).toBe(12);
    expect(t.connected).toBe(true);
    expect(t.truck.speedKmh).toBeCloseTo(90, 2);
    expect(t.truck.fuelRatio).toBeCloseTo(0.375, 3);
    expect(t.truck.adblueRatio).toBeCloseTo(0.75, 3);
    expect(t.truck.speedLimitKmh).toBeCloseTo(80, 1);
    expect(t.truck.world.x).toBe(1200);
    expect(t.truck.world.z).toBe(-3400);
    expect(t.job.active).toBe(true);
    expect(t.job.destinationCity).toBe('柏林');
    expect(t.job.sourceCity).toBe('阿姆斯特丹');
    expect(t.job.plannedDistanceKm).toBe(450);
    expect(t.job.income).toBe(12500);
    expect(t.events.special.onJob).toBe(true);
  });
});
