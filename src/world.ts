/** The native Node World: SCS telemetry, events and radar, exposed to Coo. */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Language } from 'cortico/core/language.ts';
import type {
  ConfigGroup,
  ToolDef,
  World,
  WorldHost,
  WorldWebUiDecl,
} from 'cortico/core/types.ts';
import { CityBook } from './cities.ts';
import { ETS2_CONFIG_GROUP, type Ets2ConfigSection } from './config.ts';
import { EventEngine, type GameEvent, type GameEventKind } from './events.ts';
import { inspectGameRoot, installScsTelemetry, type TelemetryInstallResult } from './installer.ts';
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
      'Return the most recent ETS2 events this World has reported (accident, speeding, fine, toll, job, radar, city, connection).',
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
  {
    name: 'ets2_install_telemetry',
    description:
      'Download the latest RenCloud scs-sdk-plugin release and install/repair scs-telemetry.dll in the ETS2 game folder. Use only after the driver chooses the game root.',
    tags: ['act'],
    barrierAfter: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        game_root: {
          type: 'string',
          description: 'ETS2 root folder containing bin\\win_x64\\eurotrucks2.exe. Omit to use the configured gameRoot.',
        },
      },
    },
  },
  {
    name: 'ets2_cities',
    description:
      'List locally recorded ETS2 cities with their distance from the truck, and show which city the truck is currently inside.',
    tags: ['read', 'snapshot'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many cities; default 15.' },
      },
    },
  },
  {
    name: 'ets2_record_city',
    description:
      'Record the truck’s current position as a city geofence. Use when the driver is in a city that is not learned automatically from a job.',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'City name, e.g. Berlin or 柏林.' },
        radius_m: { type: 'integer', minimum: 200, maximum: 5000, description: 'City radius in metres; default 1500.' },
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
  /** Live config writer supplied by Coopanion, used by the installer panel. */
  persist?: (patch: Partial<Ets2ConfigSection>) => void;
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
  private readonly cities: CityBook;
  private host: WorldHost | null = null;
  private timer: NodeJS.Timeout | null = null;
  private latest: Ets2Telemetry | null = null;
  private lastConnected: boolean | null = null;
  private events: LoggedEvent[] = [];
  private started = false;
  private lastInstall: (TelemetryInstallResult & { at: string }) | null = null;
  /** Cities already introduced during this Coopanion run. */
  private readonly introducedCities = new Set<string>();

  constructor(private readonly opts: Ets2WorldOptions) {
    this.engine = new EventEngine(opts.cfg);
    this.radar = new RadarBook(join(opts.dataDir, 'ets2-radar-points.json'), opts.cfg);
    this.cities = new CityBook(join(opts.dataDir, 'ets2-cities.json'), opts.cfg);
  }

  envPromptVars(): Record<string, string> | null {
    const t = this.latest;
    if (!t) {
      return {
        'ets2.status': 'ETS2 遥测：未连接（请启动游戏并进入驾驶界面）。',
        'ets2.job': '当前任务：未知。',
        'ets2.city': '当前城市：未知（遥测未连接）。',
        'ets2.radar': `电子狗：${this.radar.count} 个点位。`,
        'ets2.recent': '最近事件：无。',
      };
    }
    if (!t.connected) {
      return {
        'ets2.status': 'ETS2 遥测：共享内存未连接（游戏可能没开，或没进驾驶界面）。',
        'ets2.job': '当前任务：未知。',
        'ets2.city': '当前城市：未知（遥测未连接）。',
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
    const currentCity = this.cities.current;
    return {
      'ets2.status': status,
      'ets2.job': job,
      'ets2.city': currentCity
        ? `当前城市：${currentCity.name}（距中心约 ${Math.round(Math.hypot(tr.world.x - currentCity.x, tr.world.z - currentCity.z))} 米）。`
        : `当前城市：不在已记录的城市范围内（本地共 ${this.cities.count} 个城市）。`,
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
      {
        ...TOOL_DECLS[4]!,
        handler: async (args) => this.installTelemetryTool(args),
      },
      {
        ...TOOL_DECLS[5]!,
        handler: async (args) => this.cityText(Number(args.limit) || 15),
      },
      {
        ...TOOL_DECLS[6]!,
        handler: async (args) => this.recordCityTool(args),
      },
    ];
  }

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const zh = language === 'zh' || language === 'zh-Hant';
    return {
      label: zh ? 'ETS2 欧卡桌宠副驾' : 'ETS2 Euro Truck Copilot',
      panels: [
        {
          id: 'install',
          title: zh ? '遥测安装' : 'Telemetry installer',
          description: zh
            ? '选择游戏根目录，一键下载并安装 scs-telemetry.dll。安装后重启游戏生效。'
            : 'Pick the ETS2 game folder to download and install scs-telemetry.dll. Restart the game afterwards.',
          getMethods: ['state'],
        },
        {
          id: 'cities',
          title: zh ? '城市记录' : 'City records',
          description: zh
            ? '记录城市坐标、查看当前所在城市；接单/送达时也会自动学习。'
            : 'Record city centres, see the current city, and learn endpoints from jobs.',
          getMethods: ['state'],
        },
      ],
      invoke: (panel: string, method: string, args: unknown[]) => this.invokePanel(panel, method, args),
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
            { name: 'ets2.city', description: '当前城市与本地城市记录数。' },
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
    if (this.opts.cfg.autoInstallTelemetry && this.opts.cfg.gameRoot) {
      const info = inspectGameRoot(this.opts.cfg.gameRoot);
      if (info.valid && !info.dllInstalled) {
        void this.installFromConfig(false)
          .then((state) => host.log.info(`ETS2 telemetry auto-install: ${JSON.stringify(state.lastInstall ?? {})}`))
          .catch((error) => host.log.warn(`ETS2 telemetry auto-install failed: ${error instanceof Error ? error.message : String(error)}`));
      } else if (!info.valid) {
        host.log.warn(`ETS2 telemetry auto-install skipped: ${info.error}`);
      }
    }
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
            for (const event of gameEvents) {
              if (this.opts.cfg.cityLearnEnabled) {
                if (event.kind === 'job_started' && telemetry.job.sourceCity) {
                  this.cities.recordAuto(
                    telemetry.job.sourceCity,
                    telemetry.truck.world.x,
                    telemetry.truck.world.z,
                  );
                } else if (event.kind === 'job_delivered' && telemetry.job.destinationCity) {
                  this.cities.recordAuto(
                    telemetry.job.destinationCity,
                    telemetry.truck.world.x,
                    telemetry.truck.world.z,
                  );
                }
              }
              this.pushGameEvent(event);
            }
            const enteredCity = this.cities.detect(telemetry);
            if (enteredCity && this.opts.cfg.cityAnnounceEnabled) {
              const key = enteredCity.name.toLowerCase();
              const firstVisit = !this.introducedCities.has(key);
              if (firstVisit) this.introducedCities.add(key);
              const repeatIntro = !firstVisit && this.opts.cfg.cityRepeatIntro;
              const suffix = firstVisit
                ? '（首次到达，可简短介绍）'
                : repeatIntro
                  ? '（再次到达，可再简短介绍）'
                  : '（已介绍过，简短报到即可）';
              this.pushEvent(
                'ets2.city-entered',
                `ETS2 进入城市：${enteredCity.name}${suffix}`,
                'debounce',
                { kind: 'city', city: enteredCity.name, firstVisit, repeatIntro },
              );
            }
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

  private installState(): Record<string, unknown> {
    const info = inspectGameRoot(this.opts.cfg.gameRoot);
    return {
      gameRoot: info.gameRoot,
      valid: info.valid,
      error: info.error,
      dllInstalled: info.dllInstalled,
      dllBytes: info.dllBytes,
      dllPath: info.dllPath,
      autoInstallTelemetry: this.opts.cfg.autoInstallTelemetry,
      lastInstall:
        this.lastInstall &&
        info.gameRoot &&
        this.lastInstall.dllPath.toLowerCase().startsWith(info.gameRoot.toLowerCase())
          ? this.lastInstall
          : null,
    };
  }

  private async invokePanel(
    panel: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    if (panel === 'install') {
      switch (method) {
        case 'state':
          return this.installState();
        case 'setPath':
          return this.setGameRoot(typeof args[0] === 'string' ? args[0] : '');
        case 'setAuto':
          return this.setAutoInstall(args[0] === true);
        case 'install':
          return this.installFromConfig(true, typeof args[0] === 'string' ? args[0] : undefined);
        default:
          throw new Error(`unknown method: ${method}`);
      }
    }
    if (panel === 'cities') {
      switch (method) {
        case 'state':
          return this.cityState();
        case 'record': {
          const payload = args[0] && typeof args[0] === 'object'
            ? (args[0] as Record<string, unknown>)
            : {};
          return this.recordCity(payload);
        }
        case 'delete':
          return this.deleteCity(typeof args[0] === 'string' ? args[0] : '');
        case 'clear':
          return this.clearCities();
        default:
          throw new Error(`unknown method: ${method}`);
      }
    }
    throw new Error(`unknown panel: ${panel}`);
  }

  private setGameRoot(raw: string): Record<string, unknown> {
    const input = raw.trim();
    if (!input) {
      this.opts.cfg.gameRoot = '';
      this.opts.persist?.({ gameRoot: '' });
      return this.installState();
    }
    const info = inspectGameRoot(input);
    if (!info.valid) throw new Error(info.error ?? '无效的游戏根目录');
    this.opts.cfg.gameRoot = info.gameRoot;
    this.opts.persist?.({ gameRoot: info.gameRoot });
    return this.installState();
  }

  private setAutoInstall(enabled: boolean): Record<string, unknown> {
    this.opts.cfg.autoInstallTelemetry = enabled;
    this.opts.persist?.({ autoInstallTelemetry: enabled });
    return this.installState();
  }

  private async installFromConfig(force: boolean, rawRoot?: string): Promise<Record<string, unknown>> {
    const input = (rawRoot ?? this.opts.cfg.gameRoot).trim();
    if (!input) throw new Error('请先选择 ETS2 游戏根目录');
    const info = inspectGameRoot(input);
    if (!info.valid) throw new Error(info.error ?? '无效的游戏根目录');
    if (this.opts.cfg.gameRoot !== info.gameRoot) {
      this.opts.cfg.gameRoot = info.gameRoot;
      this.opts.persist?.({ gameRoot: info.gameRoot });
    }
    if (!force && info.dllInstalled) return this.installState();
    const result = await installScsTelemetry(info.gameRoot);
    this.lastInstall = { ...result, at: new Date().toISOString() };
    this.host?.log.info(`ETS2 telemetry installed: ${result.dllPath}`);
    return this.installState();
  }

  private async installTelemetryTool(args: Record<string, unknown>): Promise<string> {
    const root = typeof args.game_root === 'string' ? args.game_root : undefined;
    await this.installFromConfig(true, root);
    return this.lastInstall?.message ?? '遥测已安装。重启游戏后生效。';
  }

  private cityState(): Record<string, unknown> {
    if (this.latest) this.cities.remember(this.latest);
    return {
      count: this.cities.count,
      current: this.cities.current,
      cities: this.cities.nearest(500),
      hasTelemetry: Boolean(this.latest?.connected),
    };
  }

  private recordCity(args: Record<string, unknown>): Record<string, unknown> {
    const t = this.latest;
    if (!t?.connected) throw new Error('ETS2 还没连接，先进入驾驶界面');
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    if (!name) throw new Error('请填写城市名');
    this.cities.record(
      name,
      t.truck.world.x,
      t.truck.world.z,
      args.radius_m == null ? this.opts.cfg.cityRadiusM : Number(args.radius_m),
      'manual',
    );
    return this.cityState();
  }

  private deleteCity(id: string): Record<string, unknown> {
    if (!id) throw new Error('缺少城市 id');
    this.cities.remove(id);
    return this.cityState();
  }

  private clearCities(): Record<string, unknown> {
    this.cities.clear();
    return this.cityState();
  }

  private cityText(limit: number): string {
    if (this.latest) this.cities.remember(this.latest);
    const current = this.cities.current;
    const rows = this.cities.nearest(limit);
    const head = current
      ? `当前在 ${current.name}（半径 ${current.radiusM} 米）`
      : `当前不在已记录的城市范围内（本地共 ${this.cities.count} 个）`;
    if (!rows.length) return `${head}。还没有城市记录：接单/送达会自动学习，或在「城市记录」面板手动记录。`;
    return [
      head,
      ...rows.map((p) => {
        const distance = p.distanceM == null ? '--' : `${fmt(p.distanceM)} m`;
        return `${p.name}（${p.source === 'manual' ? '手动' : '自动'}，${distance}，半径 ${p.radiusM} m）`;
      }),
    ].join('\n');
  }

  private recordCityTool(args: Record<string, unknown>): string {
    this.recordCity(args);
    const name = String(args.name ?? '').trim();
    return `已记录城市：${name}。以后进入它 ${args.radius_m ?? this.opts.cfg.cityRadiusM} 米范围时会播报。`;
  }

  private statusText(): string {
    const t = this.latest;
    if (!t) {
      const info = inspectGameRoot(this.opts.cfg.gameRoot);
      const hint = info.dllInstalled
        ? '请启动游戏并进入驾驶界面。'
        : '可先在 World 的「遥测安装」面板选择游戏根目录并安装 scs-telemetry.dll。';
      return `ETS2 遥测未连接：${hint}`;
    }
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
