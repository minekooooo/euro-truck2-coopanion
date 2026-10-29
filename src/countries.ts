/**
 * Country border crossings extracted from map nodes (`Node.IsCountryBorder`).
 *
 * Each border stores the node position, the road's forward normal, and the
 * country IDs on the forward/backward side. A crossing is detected by the
 * signed side of the previous and current truck positions changing across the
 * border plane, while the crossing point stays inside a narrow road corridor.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Ets2Telemetry } from './telemetry.ts';

export interface BorderPoint {
  id: string;
  x: number;
  z: number;
  nx: number;
  nz: number;
  forwardCountry: number;
  backwardCountry: number;
  forwardName: string;
  backwardName: string;
  source: string;
}

export interface CountryCrossing {
  border: BorderPoint;
  country: string;
  fromCountry: string;
  direction: 'forward' | 'backward';
}

interface BorderFile {
  borders?: Array<Partial<BorderPoint>>;
}

const DEFAULT_CORRIDOR_M = 80;
const MAX_SEGMENT_M = 500;
const COOLDOWN_MS = 30_000;

export class CountryBook {
  private borders: BorderPoint[] = [];
  private previous: { x: number; z: number } | null = null;
  private readonly lastCross = new Map<string, number>();

  constructor(
    path = fileURLToPath(new URL('../assets/borders.json', import.meta.url)),
    private readonly corridorM = DEFAULT_CORRIDOR_M,
  ) {
    if (!existsSync(path)) return;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as BorderFile;
      for (const item of raw.borders ?? []) {
        const x = Number(item.x);
        const z = Number(item.z);
        const nx = Number(item.nx);
        const nz = Number(item.nz);
        if (![x, z, nx, nz].every(Number.isFinite)) continue;
        const len = Math.hypot(nx, nz);
        if (len < 0.01) continue;
        this.borders.push({
          id: String(item.id || `border_${this.borders.length + 1}`),
          x,
          z,
          nx: nx / len,
          nz: nz / len,
          forwardCountry: Number(item.forwardCountry) || 0,
          backwardCountry: Number(item.backwardCountry) || 0,
          forwardName: String(item.forwardName || ''),
          backwardName: String(item.backwardName || ''),
          source: String(item.source || ''),
        });
      }
    } catch {
      // A missing or malformed border file just disables country detection.
    }
  }

  get count(): number {
    return this.borders.length;
  }

  list(): BorderPoint[] {
    return this.borders;
  }

  detect(telemetry: Ets2Telemetry): CountryCrossing | null {
    if (!telemetry.connected || telemetry.paused) {
      this.previous = null;
      return null;
    }
    const x = telemetry.truck.world.x;
    const z = telemetry.truck.world.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      this.previous = null;
      return null;
    }
    if (!this.previous) {
      this.previous = { x, z };
      return null;
    }
    const p = this.previous;
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.hypot(dx, dz) > MAX_SEGMENT_M) {
      // Loading a save / ferry / teleport: do not interpret the jump as a crossing.
      this.previous = { x, z };
      return null;
    }

    const now = Date.now();
    let best: {
      border: BorderPoint;
      lateral: number;
      direction: 'forward' | 'backward';
    } | null = null;

    for (const border of this.borders) {
      const s0 = (p.x - border.x) * border.nx + (p.z - border.z) * border.nz;
      const s1 = (x - border.x) * border.nx + (z - border.z) * border.nz;
      const forward = s0 < 0 && s1 >= 0;
      const backward = s0 > 0 && s1 <= 0;
      if (!forward && !backward) continue;
      const denom = s0 - s1;
      if (Math.abs(denom) < 1e-6) continue;
      const t = s0 / denom;
      if (t < 0 || t > 1) continue;
      const ix = p.x + dx * t;
      const iz = p.z + dz * t;
      const lateral = Math.hypot(ix - border.x, iz - border.z);
      if (lateral > this.corridorM) continue;
      if (now - (this.lastCross.get(border.id) ?? 0) < COOLDOWN_MS) continue;
      if (!best || lateral < best.lateral) {
        best = { border, lateral, direction: forward ? 'forward' : 'backward' };
      }
    }

    this.previous = { x, z };
    if (!best) return null;
    this.lastCross.set(best.border.id, now);
    const entering = best.direction === 'forward'
      ? best.border.forwardName
      : best.border.backwardName;
    const from = best.direction === 'forward'
      ? best.border.backwardName
      : best.border.forwardName;
    if (!entering || !from || entering === from) return null;
    return {
      border: best.border,
      country: entering,
      fromCountry: from,
      direction: best.direction,
    };
  }
}
