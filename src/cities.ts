/**
 * City geofences learned from the job source/destination names and the truck's
 * world position. There is no "current city" field in the SCS telemetry, so a
 * small local database of city centres is the reliable way to announce entering
 * one.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Ets2Telemetry } from './telemetry.ts';

export type CitySource = 'auto' | 'manual' | 'map';

export interface CityPoint {
  id: string;
  name: string;
  token?: string;
  country?: string;
  x: number;
  z: number;
  radiusM: number;
  widthM?: number;
  heightM?: number;
  source: CitySource;
  createdAt: number;
}

export interface CityConfig {
  cityRadiusM: number;
}

interface CityFilePoint {
  id?: string;
  name?: string;
  token?: string;
  country?: string;
  x?: number;
  z?: number;
  radius_m?: number;
  width_m?: number;
  height_m?: number;
  source?: string;
  created_at?: number;
}

function clampRadius(value: unknown, fallback: number): number {
  const n = Number(value);
  return Math.max(200, Math.min(5000, Number.isFinite(n) ? Math.round(n) : fallback));
}

function distance(x1: number, z1: number, x2: number, z2: number): number {
  return Math.hypot(x1 - x2, z1 - z2);
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
}

export class CityBook {
  private points: CityPoint[] = [];
  private currentId: string | null = null;
  private initialized = false;

  constructor(
    private readonly userPath: string,
    private readonly config: CityConfig,
  ) {
    this.loadBuiltin();
    this.loadUser();
  }

  get count(): number {
    return this.points.length;
  }

  get current(): CityPoint | null {
    return this.points.find((p) => p.id === this.currentId) ?? null;
  }

  list(): CityPoint[] {
    return this.points;
  }

  private loadBuiltin(): void {
    try {
      const path = fileURLToPath(new URL('../assets/cities.json', import.meta.url));
      if (!existsSync(path)) return;
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { cities?: CityFilePoint[] };
      for (const item of raw.cities ?? []) this.add(item, 'map');
    } catch {
      // A missing packaged city DB just leaves the user/manual book.
    }
  }

  private loadUser(): void {
    if (!existsSync(this.userPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.userPath, 'utf8')) as { points?: CityFilePoint[] };
      for (const item of raw.points ?? []) this.add(item, item.source === 'manual' ? 'manual' : 'auto');
    } catch {
      // A corrupt optional file must not stop the World.
    }
  }

  private add(item: CityFilePoint, source: CitySource): void {
    const name = cleanName(item.name);
    const x = Number(item.x);
    const z = Number(item.z);
    if (!name || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const point: CityPoint = {
      id: String(item.id || `city_${this.points.length + 1}`),
      name,
      token: item.token ? String(item.token) : undefined,
      country: item.country ? String(item.country) : undefined,
      x,
      z,
      radiusM: clampRadius(item.radius_m, this.config.cityRadiusM),
      widthM: Number.isFinite(Number(item.width_m)) ? Number(item.width_m) : undefined,
      heightM: Number.isFinite(Number(item.height_m)) ? Number(item.height_m) : undefined,
      source,
      createdAt: Number(item.created_at) || Date.now(),
    };
    const existing = this.points.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
      // User entries override packaged map entries; built-in entries never
      // overwrite an earlier user record.
      if (source !== 'map' || this.points[existing]!.source === 'map') {
        this.points[existing] = point;
      }
      return;
    }
    this.points.push(point);
  }

  private save(): void {
    try {
      const tmp = `${this.userPath}.tmp`;
      writeFileSync(
        tmp,
        JSON.stringify(
          {
            version: 1,
            points: this.points
              .filter((p) => p.source !== 'map')
              .map((p) => ({
                id: p.id,
                name: p.name,
                token: p.token,
                country: p.country,
                x: p.x,
                z: p.z,
                radius_m: p.radiusM,
                width_m: p.widthM,
                height_m: p.heightM,
                source: p.source,
                created_at: p.createdAt,
              })),
          },
          null,
          2,
        ),
      );
      renameSync(tmp, this.userPath);
    } catch {
      // The in-memory record is still usable in a read-only data directory.
    }
  }

  record(
    name: string,
    x: number,
    z: number,
    radiusM: number,
    source: CitySource,
  ): CityPoint {
    const clean = cleanName(name);
    if (!clean) throw new Error('城市名不能为空');
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('没有可用的世界坐标');
    const radius = clampRadius(radiusM, this.config.cityRadiusM);
    const existing = this.points.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      // A manual point is authoritative; auto-learning never overwrites it.
      if (source === 'manual' || existing.source === 'auto') {
        existing.name = clean;
        existing.x = x;
        existing.z = z;
        existing.radiusM = radius;
        existing.source = source;
      }
      this.save();
      return existing;
    }
    const point: CityPoint = {
      id: `city_${Date.now().toString(36)}_${this.points.length}`,
      name: clean,
      x,
      z,
      radiusM: radius,
      source,
      createdAt: Date.now(),
    };
    this.points.push(point);
    this.points = this.points.slice(-2000);
    this.save();
    return point;
  }

  recordAuto(name: string, x: number, z: number): CityPoint | null {
    const clean = cleanName(name);
    if (!clean || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const existing = this.points.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    return this.record(clean, x, z, this.config.cityRadiusM, 'auto');
  }

  remove(id: string): boolean {
    const target = this.points.find((p) => p.id === id);
    if (!target || target.source === 'map') return false;
    this.points = this.points.filter((p) => p.id !== id);
    if (this.currentId === id) this.currentId = null;
    this.save();
    return true;
  }

  clear(): void {
    // Packaged map cities stay; only the learned/manual overlay is cleared.
    this.points = this.points.filter((p) => p.source === 'map');
    this.currentId = null;
    this.save();
  }

  nearest(limit = 12): Array<CityPoint & { distanceM: number | null }> {
    const t = this.latestTelemetry;
    const x = t?.truck.world.x;
    const z = t?.truck.world.z;
    return [...this.points]
      .map((p) => ({
        ...p,
        distanceM:
          Number.isFinite(x) && Number.isFinite(z)
            ? Math.round(distance(x!, z!, p.x, p.z))
            : null,
      }))
      .sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER))
      .slice(0, Math.max(1, Math.min(1000, limit)));
  }

  /** Last telemetry passed to detect(), used for the panel's distance labels. */
  private latestTelemetry: Ets2Telemetry | null = null;

  /**
   * Returns the city entered on this tick, or null. The first tick that starts
   * inside a city silently adopts it, so loading a save in a city does not spam
   * an announcement.
   */
  detect(telemetry: Ets2Telemetry): CityPoint | null {
    this.latestTelemetry = telemetry;
    if (!telemetry.connected || telemetry.paused) return null;
    const x = telemetry.truck.world.x;
    const z = telemetry.truck.world.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

    // The first connected tick initializes the baseline even when the truck
    // starts outside every city. Only a first tick *inside* a city is silent;
    // otherwise the first entry after starting outside would be swallowed too.
    const firstTick = !this.initialized;
    this.initialized = true;

    let candidate: CityPoint | null = null;
    let candidateDistance = Infinity;
    for (const point of this.points) {
      const radius = point.radiusM || this.config.cityRadiusM;
      const d = distance(x, z, point.x, point.z);
      if (d <= radius && d < candidateDistance) {
        candidate = point;
        candidateDistance = d;
      }
    }

    if (!candidate) {
      if (this.currentId) {
        const old = this.points.find((p) => p.id === this.currentId);
        if (old && distance(x, z, old.x, old.z) > old.radiusM * 1.25) this.currentId = null;
      }
      return null;
    }
    if (this.currentId === candidate.id) return null;
    this.currentId = candidate.id;
    if (firstTick) return null;
    return candidate;
  }

  /** Called on telemetry after a job starts/ends; keeps the panel distances fresh. */
  remember(telemetry: Ets2Telemetry): void {
    this.latestTelemetry = telemetry;
  }
}
