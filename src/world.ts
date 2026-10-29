/** The native Node World: SCS telemetry, events and radar, exposed to Coo. */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  ConfigGroup,
  ToolDef,
  World,
  WorldHost,
  WorldWebUiDecl,
} from 'cortico/core/types.ts';
import { ETS2_CONFIG_GROUP, type Ets2ConfigSection } from './config.ts';
import { EventEngine, type GameEvent, type GameEventKind } from './events.ts';
import { RadarBook } from './radar.ts';
import { parseTelemetry, ScsSharedMemory, type Ets2Telemetry } from './telemetry.ts';

export const ETS2_WORLD_ID = 'ets2-dafeiyu';
const ID = ETS2_WORLD_ID;
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

export const TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'ets2_status',
    description:
      'Read the current ETS2 telemetry snapshot: connection, speed, speed limit, gear, fuel, AdBlue, damage, odometer, job and navigation.',
    tags: ['read', 'snapshot'],
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'ets2_recent_events',
    description:
      'Return the most recent ETS2 events this World has reported (accident, speeding, fine, toll, job, radar, connection).',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'How many events; default 8.' },
      },
    },
  },
  {
    name: 'ets2_radar_points',
    description:
      'List the nearest stored ETS2 radar/POI points (speed cameras, tolls, weigh stations, rail crossings, police, accident, fine) with distance from the truck.',
    tags: ['read', 'snapshot'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'How many points; default 10.' },
      },
    },
  },
  {
    name: 'ets2_record_radar',
    description:
      'Record the truck’s current world position as a radar/POI point. Use when the driver passes a speed camera, toll, weigh station or similar place so it can warn next time.',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: ['speed_camera', 'toll', 'weigh', 'rail', 'police', 'accident', 'fine'],
          description: 'Kind of point to record.',
        },
        name: { type: 'string', description: 'Optional display name.' },
        radius_m: { type: 'integer', minimum: 50, maximum: 5000, description: 'Warning radius in metres.' },
      },
    },
  },
];

export const ETS2_EVENT_TYPES: Record<GameEventKind, string> = {
  job_started: 'ets2.job-started',
  job_delivered: 'ets2.job-delivered',
  job_cancelled: 'ets2.job-cancelled',
  speeding: 'ets2.speeding',
  low_fuel: 'ets2.low-fuel',
  accident: 'ets2.accident',
  fine: 'ets2.fine',
  tollgate: 'ets2.tollgate',
  ferry: 'ets2.ferry',
  train: 'ets2.train',
  refuel: 'ets2.refuel',
  city_arrival: 'ets2.city-arrival',
};

interface LoggedEvent {
  ts: string;
  kind: string;
  text: string;
}

export interface Ets2WorldOptions {
  cfg: Ets2ConfigSection;
  dataDir: string;
  timezone: string;
}

function clampPoll(value: number): number {
  return Math.max(100, Math.min(2000, Math.round(Number(value) || 200)));
}

function fmt(value: number, digits = 0): string {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export class Ets2World implements World {
  readonly id = ID;
  private readonly shm = new ScsSharedMemory();
  private readonly engine: EventEngine;
  private readonly radar: RadarBook;
  private host: WorldHost | null = null;
  private timer: NodeJS.Timeout | null = null;
  private latest: Ets2Telemetry | null = null;
  private lastConnected: boolean | null = null;
  private events: LoggedEvent[] = [];
  private started = false;

  constructor(private readonly opts: Ets2WorldOptions) {
    this.engine = new EventEngine(opts.cfg);
    this.radar = new RadarBook(join(opts.dataDir, 'ets2-radar-points.json'), opts.cfg);
  }

  envPromptVars(): Record<string, string> | null {
    const t = this.latest;
    if (!t) {
      return {
        'ets2.status': 'ETS2 遥测：未连接（请启动游戏并进入驾驶界面）。',
        'ets2.job': '当前任务：未知。',
        'ets2.radar': `电子狗：${this.radar.count} 个点位。`,
        'ets2.recent': '最近事件：无。',
      };
    }
    if (!t.connected) {
      return {
        'ets2.status': 'ETS2 遥测：共享内存未连接（游戏可能没开，或没进驾驶界面）。',
        'ets2.job': '当前任务：未知。',
        'ets2.radar': `电子狗：${this.radar.count} 个点位。`,
        'ets2.recent': this.recentText(3),
      };
    }
    const tr = t.truck;
    const limit = tr.speedLimitKmh > 1 ? `，限速 ${fmt(tr.speedLimitKmh)}` : '';
    const paused = t.paused ? '（游戏暂停）' : '';
    const status =
      `ETS2 遥测已连接${paused}：${fmt(tr.speedKmh)} km/h${limit}，` +
      `档位 ${tr.displayedGear || tr.gear}，油量 ${tr.fuelRatio == null ? '--' : `${fmt(tr.fuelRatio * 100)}%`}，` +
      `车损 ${fmt(tr.damageMax * 100, 1)}%，总里程 ${fmt(tr.odometerKm)} 公里。`;
    const job = t.job.destinationCity
      ? `当前任务：${t.job.cargo || '货物'}，${t.job.sourceCity || '?'} → ${t.job.destinationCity}，` +
        `剩余约 ${fmt(t.truck.navDistanceM / 1000, 1)} 公里，运费 €${fmt(t.job.income)}。`
      : '当前任务：没有接单。';
    const radar = `电子狗：${this.radar.count} 个点位；${this.radar.lastHit ? `上次提醒：${this.radar.lastHit.text}` : '最近没有提醒。'}`;
    return {
      'ets2.status': status,
      'ets2.job': job,
      'ets2.radar': radar,
      'ets2.recent': this.recentText(4),
    };
  }

  tools(): ToolDef[] {
    return [
      {
        ...TOOL_DECLS[0]!,
        handler: async () => this.statusText(),
      },
      {
        ...TOOL_DECLS[1]!,
        handler: async (args) => this.recentText(Number(args.limit) || 8),
      },
      {
        ...TOOL_DECLS[2]!,
        handler: async (args) => this.radarText(Number(args.limit) || 10),
      },
      {
        ...TOOL_DECLS[3]!,
        handler: async (args) => this.recordRadar(args),
      },
    ];
  }

  webUi(): WorldWebUiDecl {
    return {
      label: 'ETS2 大肥鱼副驾',
      config: [ETS2_CONFIG_GROUP as ConfigGroup],
      promptDocs: [
        {
          key: 'worlds.ets2-dafeiyu.envPrompt',
          title: 'ETS2 · 环境提示词',
          description: '告诉 Coo 当前车况、任务和电子狗状态。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'ets2.status', description: '连接、速度、限速、油量、车损。' },
            { name: 'ets2.job', description: '当前任务和剩余距离。' },
            { name: 'ets2.radar', description: '电子狗点位数和上次提醒。' },
            { name: 'ets2.recent', description: '最近几条 ETS2 事件。' },
          ],
        },
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.host = host;
    host.log.info('ETS2 World starting; watching Local\\SCSTelemetry');
    this.tick();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.shm.close();
    this.host = null;
  }

  private schedule(): void {
    if (!this.started) return;
    const delay = clampPoll(this.opts.cfg.pollMs);
    this.timer = setTimeout(() => {
      this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private tick(): void {
    if (!this.started) return;
    try {
      if (!this.shm.open && !this.shm.connect()) {
        this.setConnected(false);
      } else {
        const data = this.shm.read();
        if (data) {
          const telemetry = parseTelemetry(data);
          this.latest = telemetry;
          this.setConnected(telemetry.connected);
          if (telemetry.connected && !telemetry.paused) {
            const gameEvents = this.engine.update(telemetry);
            for (const event of gameEvents) this.pushGameEvent(event);
            if (this.opts.cfg.radarEnabled) {
              const hit = this.radar.detect(telemetry);
              if (hit) {
                this.pushEvent(
                  'ets2.radar',
                  `ETS2 电子狗：${hit.text}`,
                  'preempt',
                  { kind: 'radar', distanceM: hit.distanceM, type: hit.point.type },
                );
              }
            }
          }
        } else {
          this.setConnected(false);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.host?.log.warn(`ETS2 poll failed: ${detail}`);
      this.setConnected(false);
    } finally {
      this.schedule();
    }
  }

  private setConnected(connected: boolean): void {
    if (this.lastConnected === connected) return;
    const first = this.lastConnected === null;
    this.lastConnected = connected;
    if (first && !connected) return;
    this.pushEvent(
      'ets2.connection',
      connected
        ? 'ETS2 遥测已连接，可以读取车况了。'
        : 'ETS2 遥测断开（游戏关闭或退回菜单）。',
      'debounce',
      { kind: 'connection', connected },
    );
  }

  private pushGameEvent(event: GameEvent): void {
    this.pushEvent(
      ETS2_EVENT_TYPES[event.kind],
      event.text,
      event.priority >= 80 ? 'preempt' : 'debounce',
      { kind: event.kind },
    );
  }

  private pushEvent(
    type: string,
    text: string,
    trigger: 'preempt' | 'interrupt' | 'flush' | 'debounce' | 'piggyback',
    meta: Record<string, unknown>,
  ): void {
    if (!this.host) return;
    const ts = new Date().toISOString();
    this.events.push({ ts, kind: type, text });
    this.events = this.events.slice(-60);
    void this.host.pushEvent(
      {
        type,
        ts,
        source: this.id,
        origin: 'external',
        senderKey: this.id,
        text,
        meta,
      },
      { trigger },
    ).catch(() => undefined);
  }

  private statusText(): string {
    const t = this.latest;
    if (!t) return 'ETS2 遥测未连接：请启动游戏并进入驾驶界面。';
    if (!t.connected) return 'ETS2 共享内存没连上：确认 scs-telemetry.dll 在 bin\\win_x64\\plugins。';
    const tr = t.truck;
    const job = t.job;
    return [
      `连接：${t.connected ? '是' : '否'}${t.paused ? '（暂停）' : ''}`,
      `速度：${fmt(tr.speedKmh)} km/h${tr.speedLimitKmh > 1 ? ` / 限速 ${fmt(tr.speedLimitKmh)}` : ''}`,
      `档位：${tr.displayedGear || tr.gear}，转速：${fmt(tr.rpm)}`,
      `油量：${tr.fuelRatio == null ? '--' : `${fmt(tr.fuelRatio * 100)}%`}（${fmt(tr.fuelL, 1)} L，续航 ${fmt(tr.fuelRangeKm)} km）`,
      `AdBlue：${tr.adblueRatio == null ? '--' : `${fmt(tr.adblueRatio * 100)}%`}`,
      `车损：${fmt(tr.damageMax * 100, 1)}%，总里程：${fmt(tr.odometerKm)} km`,
      job.destinationCity
        ? `任务：${job.cargo || '货物'}，${job.sourceCity || '?'} → ${job.destinationCity}，剩余 ${fmt(tr.navDistanceM / 1000, 1)} km，运费 €${fmt(job.income)}`
        : '任务：无',
      `电子狗：${this.radar.count} 个点位`,
    ].join('\n');
  }

  private recentText(limit: number): string {
    const n = Math.max(1, Math.min(30, Math.round(limit)));
    const recent = this.events.slice(-n).reverse();
    if (!recent.length) return '没有 ETS2 事件。';
    return recent
      .map((e) => {
        const time = new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false });
        return `${time} ${e.text}`;
      })
      .join('\n');
  }

  private radarText(limit: number): string {
    const n = Math.max(1, Math.min(30, Math.round(limit)));
    const points = this.radar.nearest(this.latest, n);
    if (!points.length) return '电子狗还没有点位。';
    return points
      .map((p) => {
        const distance = p.distanceM == null ? '--' : `${fmt(p.distanceM)} m`;
        const limit = p.speedLimitKmh ? `，限速 ${p.speedLimitKmh}` : '';
        return `${p.name}（${p.type}，${distance}${limit}）`;
      })
      .join('\n');
  }

  private recordRadar(args: Record<string, unknown>): string {
    if (!this.latest?.connected) throw new Error('ETS2 还没连接，先进入驾驶界面');
    const point = this.radar.record(this.latest, {
      type: typeof args.type === 'string' ? args.type : 'speed_camera',
      name: typeof args.name === 'string' ? args.name : undefined,
      radiusM: args.radius_m == null ? undefined : Number(args.radius_m),
    });
    return `已记录：${point.name}（${point.type}，半径 ${point.radiusM} m）。当前共 ${this.radar.count} 个点位。`;
  }
}
