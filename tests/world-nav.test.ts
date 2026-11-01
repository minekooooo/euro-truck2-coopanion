import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ETS2_DEFAULTS } from '../src/config.ts';
import type { Ets2Telemetry } from '../src/telemetry.ts';
import { Ets2World } from '../src/world.ts';
import { makeTelemetry } from './fake-telemetry.ts';

describe('phase-one navigation', () => {
  it('tracks the job destination and exposes it to Coo', () => {
    const world = new Ets2World({
      cfg: { ...ETS2_DEFAULTS },
      dataDir: mkdtempSync(join(tmpdir(), 'ets2-nav-')),
      timezone: 'Asia/Hong_Kong',
    });
    const t = makeTelemetry();
    t.job.active = true;
    t.job.destinationCity = 'Berlin';
    t.job.plannedDistanceKm = 120;
    t.truck.navDistanceM = 80000;
    t.truck.navTimeS = 3600;
    (world as unknown as { latest: Ets2Telemetry }).latest = t;
    (world as unknown as { maybeNavigation(value: Ets2Telemetry): void }).maybeNavigation(t);
    expect((world as unknown as { navDestination: string | null }).navDestination).toBe('Berlin');
    expect(world.envPromptVars()?.['ets2.nav']).toContain('柏林');
  });

  it('does not fire every milestone while the job reports zero distance', () => {
    const world = new Ets2World({
      cfg: { ...ETS2_DEFAULTS },
      dataDir: mkdtempSync(join(tmpdir(), 'ets2-nav-zero-')),
      timezone: 'Asia/Hong_Kong',
    });
    const t = makeTelemetry();
    t.job.active = true;
    t.job.destinationCity = 'Berlin';
    t.job.plannedDistanceKm = 223;
    t.truck.navDistanceM = 0;
    const internal = world as unknown as {
      maybeNavigation(value: Ets2Telemetry): void;
      navMilestones: Set<number>;
      navHadDistance: boolean;
      navCorrectedKm(value: Ets2Telemetry, remainingKm: number): number;
    };
    // 90 km/h for 5 real seconds at local.scale 15 = 1.875 game km.
    expect(internal.navCorrectedKm(t, 200.1)).toBeCloseTo(198.225, 2);
    for (let i = 0; i < 8; i += 1) internal.maybeNavigation(t);
    expect(internal.navHadDistance).toBe(false);
    expect(internal.navMilestones.size).toBe(0);

    t.truck.navDistanceM = 223000;
    internal.maybeNavigation(t);
    expect(internal.navHadDistance).toBe(true);
    expect(internal.navMilestones.size).toBe(0);

    // 200.1 km at 90 km/h with a 5 s delay projects to ~199.9 km.
    t.truck.navDistanceM = 200100;
    internal.maybeNavigation(t);
    expect(internal.navMilestones.has(200)).toBe(true);
    expect(internal.navMilestones.size).toBe(1);
  });

  it('emits a fuel/progress update every 200 km travelled', () => {
    const world = new Ets2World({
      cfg: { ...ETS2_DEFAULTS },
      dataDir: mkdtempSync(join(tmpdir(), 'ets2-nav-progress-')),
      timezone: 'Asia/Hong_Kong',
    });
    const t = makeTelemetry();
    t.job.active = true;
    t.job.destinationCity = 'Berlin';
    t.job.plannedDistanceKm = 450;
    t.truck.navDistanceM = 450000;
    const internal = world as unknown as {
      maybeNavigation(value: Ets2Telemetry): void;
      navProgressBucket: number;
    };
    internal.maybeNavigation(t);
    expect(internal.navProgressBucket).toBe(200);
    t.truck.navDistanceM = 250000;
    internal.maybeNavigation(t);
    expect(internal.navProgressBucket).toBe(400);
  });
});
