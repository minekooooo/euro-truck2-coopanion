/** Turns consecutive telemetry snapshots into discrete, factual ETS2 events. */
import type { Ets2Telemetry, JobState, SpecialEvents } from './telemetry.ts';

export type GameEventKind =
  | 'job_started'
  | 'job_delivered'
  | 'job_cancelled'
  | 'speeding'
  | 'low_fuel'
  | 'accident'
  | 'fine'
  | 'tollgate'
  | 'ferry'
  | 'train'
  | 'refuel'
  | 'city_arrival';

export interface GameEvent {
  kind: GameEventKind;
  text: string;
  priority: number;
}

export interface EventConfig {
  eventsEnabled: boolean;
  speedingToleranceKmh: number;
  speedingCooldownS: number;
  lowFuelThreshold: number;
  accidentDamageDelta: number;
  cityArrivalDistanceM: number;
}

const OFFENCE_CN: Record<string, string> = {
  speeding: '超速',
  red_light: '闯红灯',
  redlight: '闯红灯',
  wrong_way: '逆行',
  no_lights: '没开灯',
  illegal_overtake: '违规超车',
  fatigue: '疲劳驾驶',
};

function offenceCn(raw: string): string {
  const key = raw.toLowerCase().replace(/[ -]/g, '_');
  return OFFENCE_CN[key] ?? (raw || '违规');
}

function jobKey(job: JobState): string {
  return `${job.sourceCity}|${job.destinationCity}|${job.cargo}|${job.income}`;
}

function jobCore(job: JobState): string {
  return `${job.sourceCity}|${job.destinationCity}|${job.cargo}`;
}

function money(value: number): string {
  return `€${Math.round(value).toLocaleString('en-US')}`;
}

export class EventEngine {
  private prev: Ets2Telemetry | null = null;
  private currentJob: JobState | null = null;
  private arrivalAnnounced = false;
  private lastFire = new Map<string, number>();
  private lastFine = 0;
  private lastToll = 0;
  private lowFuelLatched = false;
  private speedingLatched = false;
  private started = false;
  private lastDamage = 0;

  constructor(private readonly config: EventConfig) {}

  private cooled(key: string, seconds: number, now: number): boolean {
    return now - (this.lastFire.get(key) ?? 0) >= seconds * 1000;
  }

  private mark(key: string, now: number): void {
    this.lastFire.set(key, now);
  }

  private pulse(prev: SpecialEvents | undefined, current: SpecialEvents, key: keyof SpecialEvents): boolean {
    return Boolean(current[key]) && !Boolean(prev?.[key]);
  }

  update(t: Ets2Telemetry): GameEvent[] {
    const now = Date.now();
    const out: GameEvent[] = [];
    if (!this.started) {
      this.started = true;
      this.prev = t;
      this.syncJob(t);
      this.lastFine = t.events.fine.amount;
      this.lastToll = t.events.toll.amount;
      this.lastDamage = t.truck.damageMax;
      return out;
    }
    if (!this.config.eventsEnabled || !t.connected || t.paused) {
      this.prev = t;
      return out;
    }
    const prev = this.prev!;
    const p = prev.events.special;
    const cur = t.events.special;

    // ---- job state -------------------------------------------------------
    if (t.job.destinationCity && (t.job.active || cur.onJob)) {
      if (!this.currentJob || jobKey(t.job) !== jobKey(this.currentJob)) {
        this.currentJob = { ...t.job };
        this.arrivalAnnounced = false;
      }
    }

    // ---- job started -----------------------------------------------------
    if (this.config.eventsEnabled) {
      const onJobPulse = this.pulse(p, cur, 'onJob');
      const coreChanged = jobCore(t.job) !== jobCore(prev.job);
      const becameActive = t.job.active && !prev.job.active;
      const destAppeared = Boolean(t.job.destinationCity) && !prev.job.destinationCity;
      if (
        t.job.destinationCity &&
        (onJobPulse || becameActive || destAppeared || coreChanged) &&
        this.cooled('job_started', 8, now)
      ) {
        this.mark('job_started', now);
        const km = Math.round(t.job.plannedDistanceKm);
        out.push({
          kind: 'job_started',
          priority: 55,
          text: `ETS2 接单：${t.job.cargo || '货物'}，${t.job.sourceCity || '?'} → ${t.job.destinationCity}，${km} 公里，${money(t.job.income)}。`,
        });
      }
    }

    // ---- delivery / cancellation ----------------------------------------
    const deliveredPulse = this.pulse(p, cur, 'jobDelivered');
    const finishedPulse = this.pulse(p, cur, 'jobFinished') && !deliveredPulse;
    const revenueIncreased =
      t.events.delivery.revenue > prev.events.delivery.revenue + 0.5 &&
      t.events.delivery.revenue > 0;
    if (deliveredPulse || finishedPulse || revenueIncreased) {
      const job = this.currentJob ?? t.job;
      const revenue = t.events.delivery.revenue || job.income;
      const distance = t.events.delivery.distanceKm || job.plannedDistanceKm;
      const damage = t.events.delivery.cargoDamage || job.cargoDamage;
      out.push({
        kind: 'job_delivered',
        priority: 72,
        text: `ETS2 送达：${job.destinationCity || '目的地'}，${Math.round(distance)} 公里，运费 ${money(revenue)}，货损 ${(damage * 100).toFixed(1)}%。`,
      });
      this.currentJob = null;
      this.arrivalAnnounced = false;
      this.lastDamage = t.truck.damageMax;
    }
    if (this.pulse(p, cur, 'jobCancelled')) {
      out.push({
        kind: 'job_cancelled',
        priority: 60,
        text: `ETS2 任务取消，违约金 ${money(t.events.cancelled.penalty)}。`,
      });
      this.currentJob = null;
      this.arrivalAnnounced = false;
    }

    // ---- fines / tolls / ferry / train / refuel --------------------------
    const fine = t.events.fine.amount;
    if ((this.pulse(p, cur, 'fined') || fine > this.lastFine + 0.5) && fine >= 0) {
      this.lastFine = Math.max(this.lastFine, fine);
      out.push({
        kind: 'fine',
        priority: 85,
        text: `ETS2 罚款：${money(fine)}，原因：${offenceCn(t.events.fine.offence)}。`,
      });
    }
    const toll = t.events.toll.amount;
    if (this.pulse(p, cur, 'tollgate') || toll > this.lastToll + 0.5) {
      this.lastToll = Math.max(this.lastToll, toll);
      out.push({
        kind: 'tollgate',
        priority: 45,
        text: `ETS2 收费站：${money(toll)}。`,
      });
    }
    if (this.pulse(p, cur, 'ferry')) {
      out.push({
        kind: 'ferry',
        priority: 45,
        text: `ETS2 渡轮：${t.events.ferry.source || '?'} → ${t.events.ferry.target || '?'}，${money(t.events.ferry.pay)}。`,
      });
    }
    if (this.pulse(p, cur, 'train')) {
      out.push({
        kind: 'train',
        priority: 45,
        text: `ETS2 火车：${t.events.train.source || '?'} → ${t.events.train.target || '?'}，${money(t.events.train.pay)}。`,
      });
    }
    if (this.pulse(p, cur, 'refuel')) {
      out.push({
        kind: 'refuel',
        priority: 30,
        text: `ETS2 加油：${Math.round(t.events.refuel.amount)} 升。`,
      });
    }

    // ---- speeding --------------------------------------------------------
    const limit = t.truck.speedLimitKmh;
    if (limit > 1 && t.truck.speedKmh >= 25) {
      const over = t.truck.speedKmh - limit;
      if (over > this.config.speedingToleranceKmh) {
        if (!this.speedingLatched && this.cooled('speeding', this.config.speedingCooldownS, now)) {
          this.speedingLatched = true;
          this.mark('speeding', now);
          out.push({
            kind: 'speeding',
            priority: 65,
            text: `ETS2 超速：限速 ${Math.round(limit)}，当前 ${Math.round(t.truck.speedKmh)}。`,
          });
        }
      } else if (over <= Math.max(0, this.config.speedingToleranceKmh - 3)) {
        this.speedingLatched = false;
      }
    } else {
      this.speedingLatched = false;
    }

    // ---- low fuel --------------------------------------------------------
    const fuel = t.truck.fuelRatio;
    if (fuel != null) {
      if (fuel > 0.25 && !t.truck.warnings.fuel) {
        this.lowFuelLatched = false;
      } else if (
        (fuel < this.config.lowFuelThreshold || t.truck.warnings.fuel) &&
        !this.lowFuelLatched &&
        this.cooled('low_fuel', 180, now)
      ) {
        this.lowFuelLatched = true;
        this.mark('low_fuel', now);
        out.push({
          kind: 'low_fuel',
          priority: 75,
          text: `ETS2 低油：剩余 ${Math.round(t.truck.fuelL)} 升（${Math.round(fuel * 100)}%），续航约 ${Math.round(t.truck.fuelRangeKm)} 公里。`,
        });
      }
    }

    // ---- accident --------------------------------------------------------
    const damage = Math.max(t.truck.damageMax, t.job.cargoDamage);
    const previousDamage = this.lastDamage;
    if (
      damage - previousDamage > this.config.accidentDamageDelta &&
      this.cooled('accident', 45, now)
    ) {
      this.lastDamage = damage;
      this.mark('accident', now);
      out.push({
        kind: 'accident',
        priority: 100,
        text: `ETS2 事故：车损跳到 ${(damage * 100).toFixed(1)}%（此前 ${(Math.max(0, previousDamage) * 100).toFixed(1)}%）。`,
      });
    } else {
      // Keep the baseline current when damage falls after a repair.
      this.lastDamage = damage;
    }

    // ---- arrival ---------------------------------------------------------
    if (
      !this.arrivalAnnounced &&
      t.job.destinationCity &&
      (t.job.active || cur.onJob) &&
      t.truck.navDistanceM > 0 &&
      t.truck.navDistanceM <= this.config.cityArrivalDistanceM
    ) {
      this.arrivalAnnounced = true;
      out.push({
        kind: 'city_arrival',
        priority: 40,
        text: `ETS2 快到了：${t.job.destinationCity}，还有 ${(t.truck.navDistanceM / 1000).toFixed(1)} 公里。`,
      });
    }

    this.prev = t;
    this.syncJob(t);
    return out;
  }

  private syncJob(t: Ets2Telemetry): void {
    if (t.job.destinationCity) {
      this.currentJob = { ...t.job };
    }
  }
}
