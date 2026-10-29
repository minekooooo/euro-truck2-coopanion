/**
 * Learned / map-derived radar POIs. Coordinates are ETS2 world metres (x/z),
 * exactly the values reported by the `world_placement` channel.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Ets2Telemetry } from './telemetry.ts';

export type RadarType =
  | 'speed_camera'
  | 'toll'
  | 'weigh'
  | 'rail'
  | 'police'
  | 'accident'
  | 'fine';

export interface RadarPoint {
  id: string;
  type: RadarType;
  name: string;
  x: number;
  z: number;
  radiusM: number;
  speedLimitKmh: number;
  note: string;
  builtin: boolean;
}

export interface RadarHit {
  text: string;
  point: RadarPoint;
  distanceM: number;
}

interface RadarFilePoint {
  id?: string;
  type?: string;
  name?: string;
  x?: number;
  z?: number;
  radius_m?: number;
  speed_limit_kmh?: number;
  note?: string;
}

const TYPE_INFO: Record<RadarType, { label: string; radius: number }> = {
  speed_camera: { label: '测速/违章摄像头', radius: 600 },
  toll: { label: '收费站', radius: 500 },
  weigh: { label: '称重点', radius: 500 },
  rail: { label: '铁路道口', radius: 300 },
  police: { label: '警车', radius: 300 },
  accident: { label: '事故/施工', radius: 500 },
  fine: { label: '罚款点', radius: 500 },
};

const VALID_TYPES = new Set(Object.keys(TYPE_INFO));

function typeOf(value: unknown): RadarType {
  return typeof value === 'string' && VALID_TYPES.has(value)
    ? (value as RadarType)
    : 'speed_camera';
}

function clampRadius(value: unknown, fallback: number): number {
  const n = Number(value);
  return Math.max(50, Math.min(5000, Number.isFinite(n) ? Math.round(n) : fallback));
}

function dist(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  return Math.hypot(x1 - x2, z1 - z2);
}

/** Loads the packaged 415-point map DB plus a per-user overlay file. */
export class RadarBook {
  private points: RadarPoint[] = [];
  private armed = new Map<string, boolean>();
  private lastFire = new Map<string, number>();
  private lastAny = 0;
  lastHit: RadarHit | null = null;

  constructor(
    private readonly userPath: string,
    private readonly config: {
      radarRadiusM: number;
      radarCooldownS: number;
      radarMinSpeedKmh: number;
      radarWarnIntervalS: number;
    },
  ) {
    this.load();
  }

  get count(): number {
    return this.points.length;
  }

  list(): RadarPoint[] {
    return this.points;
  }

  private load(): void {
    const packaged = fileURLToPath(new URL('../assets/radar_points.json', import.meta.url));
    this.points = [];
    this.readFile(packaged, true);
    if (existsSync(this.userPath)) this.readFile(this.userPath, false);
  }

  private readFile(path: string, builtin: boolean): void {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { points?: RadarFilePoint[] };
      for (const item of raw.points ?? []) {
        const x = Number(item.x);
        const z = Number(item.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        const type = typeOf(item.type);
        const point: RadarPoint = {
          id: String(item.id || `p_${this.points.length + 1}`),
          type,
          name: String(item.name || TYPE_INFO[type].label).slice(0, 80),
          x,
          z,
          radiusM: clampRadius(item.radius_m, TYPE_INFO[type].radius),
          speedLimitKmh: Math.max(0, Math.min(200, Number(item.speed_limit_kmh) || 0)),
          note: String(item.note || '').slice(0, 200),
          builtin,
        };
        this.points.push(point);
      }
    } catch {
      // A missing/corrupt optional file must not stop the World.
    }
  }

  private saveUser(): void {
    const items = this.points
      .filter((p) => !p.builtin)
      .map((p) => ({
        id: p.id,
        type: p.type,
        name: p.name,
        x: p.x,
        z: p.z,
        radius_m: p.radiusM,
        speed_limit_kmh: p.speedLimitKmh,
        note: p.note,
      }));
    try {
      const tmp = `${this.userPath}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, points: items }, null, 2));
      renameSync(tmp, this.userPath);
    } catch {
      // Read-only data directories are allowed; the in-memory point still works.
    }
  }

  record(
    telemetry: Ets2Telemetry,
    opts: { type?: string; name?: string; radiusM?: number },
  ): RadarPoint {
    const x = telemetry.truck.world.x;
    const z = telemetry.truck.world.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new Error('当前没有可用的世界坐标，先进入驾驶界面');
    }
    const type = typeOf(opts.type);
    const radius = clampRadius(opts.radiusM, TYPE_INFO[type].radius);
    const limit = Math.round(telemetry.truck.speedLimitKmh);
    const name = (opts.name || `${TYPE_INFO[type].label} ${this.points.length + 1}`).slice(0, 80);
    // Same user point within 20m = update it. Built-in map points are left
    // untouched so a user recording near one still gets its own overlay.
    const existing = this.points.find(
      (p) => !p.builtin && p.type === type && dist(p.x, p.z, x, z) <= 20,
    );
    if (existing) {
      existing.name = name || existing.name;
      existing.radiusM = radius;
      if (limit > 0) existing.speedLimitKmh = limit;
      this.saveUser();
      return existing;
    }
    const point: RadarPoint = {
      id: `user_${Date.now().toString(36)}`,
      type,
      name,
      x,
      z,
      radiusM: radius,
      speedLimitKmh: limit > 0 ? limit : 0,
      note: 'recorded from telemetry',
      builtin: false,
    };
    this.points.push(point);
    this.armed.set(point.id, false);
    this.saveUser();
    return point;
  }

  nearest(
    telemetry: Ets2Telemetry | null,
    limit = 12,
  ): Array<RadarPoint & { distanceM: number | null }> {
    const t = telemetry;
    const x = t?.truck.world.x;
    const z = t?.truck.world.z;
    return [...this.points]
      .map((p) => ({
        ...p,
        distanceM:
          Number.isFinite(x) && Number.isFinite(z)
            ? Math.round(dist(x!, z!, p.x, p.z))
            : null,
      }))
      .sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER))
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  detect(telemetry: Ets2Telemetry): RadarHit | null {
    if (!telemetry.connected || telemetry.paused) return null;
    if (telemetry.truck.speedKmh < Math.max(0, this.config.radarMinSpeedKmh)) return null;
    const x = telemetry.truck.world.x;
    const z = telemetry.truck.world.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

    const now = Date.now();
    const cooldownMs = Math.max(15, this.config.radarCooldownS) * 1000;
    const intervalMs = Math.max(2, this.config.radarWarnIntervalS) * 1000;
    if (now - this.lastAny < intervalMs) return null;

    const candidates: Array<{ point: RadarPoint; distance: number }> = [];
    for (const point of this.points) {
      const radius = point.radiusM || this.config.radarRadiusM;
      const distance = dist(x, z, point.x, point.z);
      if (distance >= radius * 1.6) {
        this.armed.set(point.id, true);
        continue;
      }
      if (distance <= radius && this.armed.get(point.id) !== false) {
        if (now - (this.lastFire.get(point.id) ?? 0) >= cooldownMs) {
          candidates.push({ point, distance });
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    const { point, distance } = candidates[0]!;
    this.armed.set(point.id, false);
    this.lastFire.set(point.id, now);
    this.lastAny = now;

    const type = TYPE_INFO[point.type];
    const d = Math.max(10, Math.round(distance / 10) * 10);
    const limit = point.speedLimitKmh || Math.round(telemetry.truck.speedLimitKmh);
    let text: string;
    if (point.type === 'speed_camera') {
      text = `前方约 ${d} 米有${type.label}`;
      if (limit > 0) text += `，限速 ${limit}`;
      text += telemetry.truck.speedKmh > limit + 5 && limit > 0
        ? `；当前 ${Math.round(telemetry.truck.speedKmh)}，收油。`
        : '。注意车速。';
    } else if (point.type === 'toll') {
      text = `前方约 ${d} 米有收费站。`;
    } else if (point.type === 'weigh') {
      text = `前方约 ${d} 米有称重点，慢点过。`;
    } else if (point.type === 'rail') {
      text = `前方约 ${d} 米有铁路道口，减速。`;
    } else {
      text = `前方约 ${d} 米有${type.label}，注意。`;
    }
    const hit = { text, point, distanceM: Math.round(distance) };
    this.lastHit = hit;
    return hit;
  }
}
