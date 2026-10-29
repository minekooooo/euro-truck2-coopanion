import { describe, expect, it } from 'vitest';
import { EventEngine } from '../src/events.ts';
import { cloneTelemetry, makeTelemetry } from './fake-telemetry.ts';

const config = {
  eventsEnabled: true,
  speedingToleranceKmh: 5,
  speedingCooldownS: 25,
  lowFuelThreshold: 0.15,
  accidentDamageDelta: 0.002,
  cityArrivalDistanceM: 1200,
};

describe('ETS2 event engine', () => {
  it('reports speeding once and then waits for the cooldown', () => {
    const engine = new EventEngine(config);
    const t = makeTelemetry();
    engine.update(t);
    const events = engine.update(t);
    expect(events.map((e) => e.kind)).toContain('speeding');
    expect(engine.update(t)).toHaveLength(0);
  });

  it('reports a damage jump as an accident', () => {
    const engine = new EventEngine(config);
    const t = makeTelemetry();
    engine.update(t);
    const damaged = cloneTelemetry(t);
    damaged.truck.damageMax = 0.05;
    const events = engine.update(damaged);
    expect(events.map((e) => e.kind)).toContain('accident');
  });

  it('reports low fuel', () => {
    const engine = new EventEngine(config);
    const t = makeTelemetry();
    t.truck.warnings.fuel = false;
    engine.update(t);
    const low = cloneTelemetry(t);
    low.truck.fuelL = 50;
    low.truck.fuelRatio = 0.0625;
    low.truck.fuelRangeKm = 80;
    const events = engine.update(low);
    expect(events.map((e) => e.kind)).toContain('low_fuel');
  });
});
