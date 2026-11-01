import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ETS2_DEFAULTS } from '../src/config.ts';
import { Ets2World } from '../src/world.ts';
import { makeTelemetry } from './fake-telemetry.ts';

describe('vehicle-start welcome', () => {
  it('welcomes each truck once per World session, not on every engine restart', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ets2-vehicle-'));
    const t = makeTelemetry();
    t.truck.brand = 'Scania';
    t.truck.truckName = 'R 2009';
    t.truck.truckId = 'truck_test_1';

    const first = new Ets2World({ cfg: { ...ETS2_DEFAULTS }, dataDir, timezone: 'Asia/Hong_Kong' });
    const internal = first as unknown as {
      maybeVehicleWelcome(value: ReturnType<typeof makeTelemetry>): void;
      vehicleWelcomeAnnounced: Set<string>;
      gameClock(minutes: number): string;
    };
    expect(internal.gameClock(515)).toBe('08:35');
    t.truck.engineOn = false;
    internal.maybeVehicleWelcome(t);
    expect(internal.vehicleWelcomeAnnounced.size).toBe(0);

    t.truck.engineOn = true;
    internal.maybeVehicleWelcome(t);
    expect(internal.vehicleWelcomeAnnounced.has('truck_test_1')).toBe(true);

    t.truck.engineOn = false;
    internal.maybeVehicleWelcome(t);
    t.truck.engineOn = true;
    internal.maybeVehicleWelcome(t);
    expect(internal.vehicleWelcomeAnnounced.size).toBe(1);

    t.truck.truckId = 'truck_test_2';
    internal.maybeVehicleWelcome(t);
    expect(internal.vehicleWelcomeAnnounced.size).toBe(2);

    // A new Coopanion/game session gets another welcome.
    const second = new Ets2World({ cfg: { ...ETS2_DEFAULTS }, dataDir, timezone: 'Asia/Hong_Kong' });
    expect((second as unknown as { vehicleWelcomeAnnounced: Set<string> }).vehicleWelcomeAnnounced.size).toBe(0);
  });
});
