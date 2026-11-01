/** The native Node World: SCS telemetry, events and radar, exposed to Coo. */
import { existsSync, readFileSync } from 'node:fs';
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
import { CountryBook } from './countries.ts';
import { EventEngine, type GameEvent, type GameEventKind } from './events.ts';
import { gameKind, gameRegion, gameShort, gameTitle, type GameKind } from './game.ts';
import { inspectGameRoot, installScsTelemetry, type TelemetryInstallResult } from './installer.ts';
import { RadarBook } from './radar.ts';
import { parseTelemetry, ScsSharedMemory, type Ets2Telemetry } from './telemetry.ts';
import { vehicleBrandName, vehicleIdentity } from './vehicles.ts';

export const ETS2_WORLD_ID = 'ets2-dafeiyu';
const ID = ETS2_WORLD_ID;
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

export const TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'ets2_status',
    description:
      'Read the current ETS2 / ATS telemetry snapshot: connection, speed, speed limit, gear, fuel, AdBlue, damage, odometer, job and navigation.',
    tags: ['read', 'snapshot'],
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'ets2_recent_events',
    description:
      'Return the most recent ETS2 / ATS events this World has reported (accident, speeding, fine, toll, job, radar, city, border, navigation, vehicle, connection).',
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
      'List the nearest stored ETS2 / ATS radar/POI points (speed cameras, tolls, weigh stations, rail crossings, police, accident, fine) with distance from the truck.',
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
      'Download the latest RenCloud scs-sdk-plugin release and install/repair scs-telemetry.dll in the ETS2 / ATS game folder. Use only after the driver chooses the game root.',
    tags: ['act'],
    barrierAfter: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        game_root: {
          type: 'string',
          description: 'ETS2 / ATS root folder containing bin\\win_x64\\eurotrucks2.exe or amtrucks.exe. Omit to use the configured gameRoot.',
        },
      },
    },
  },
  {
    name: 'ets2_cities',
    description:
      'List locally recorded ETS2 / ATS cities with their distance from the truck, and show which city the truck is currently inside.',
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
  private engine: EventEngine;
  private radar: RadarBook;
  private cities: CityBook;
  private countries: CountryBook;
  private game: GameKind = 'ets2';
  private readonly cityNames: Record<string, string> = {};
  private readonly regionNames: Record<string, string> = {};
  private readonly vehicleWelcomeAnnounced = new Set<string>();
  private navDestination: string | null = null;
  private navMilestones = new Set<number>();
  private navArrived = false;
  private navHadDistance = false;
  private navTotalKm = 0;
  private navProgressBucket = 0;
  private host: WorldHost | null = null;
  private timer: NodeJS.Timeout | null = null;
  private latest: Ets2Telemetry | null = null;
  private lastConnected: boolean | null = null;
  private events: LoggedEvent[] = [];
  private started = false;
  private lastInstall: (TelemetryInstallResult & { at: string }) | null = null;
  /** Cities already introduced during this Coopanion run. */
  private readonly introducedCities = new Set<string>();
  /** Countries already introduced during this Coopanion run. */
  private readonly introducedCountries = new Set<string>();

  constructor(private readonly opts: Ets2WorldOptions) {
    this.engine = new EventEngine(opts.cfg);
    this.loadLocalizedNames();
    this.radar = this.makeRadar(this.game);
    this.cities = this.makeCities(this.game);
    this.countries = this.makeCountries(this.game);
  }

  private asset(name: string): string {
    return fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
  }

  private loadLocalizedNames(): void {
    const path = this.asset('zh_names.json');
    if (!existsSync(path)) return;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as {
        cities?: Record<string, string>;
        regions?: Record<string, string>;
      };
      for (const [key, value] of Object.entries(raw.cities ?? {})) {
        this.cityNames[key.toLowerCase()] = value;
      }
      for (const [key, value] of Object.entries(raw.regions ?? {})) {
        this.regionNames[key] = value;
        this.regionNames[key.toLowerCase()] = value;
      }
    } catch {
      // The optional Chinese-name overlay must never prevent the World loading.
    }
  }

  private cityName(city: { token?: string; name: string }): string {
    return this.cityNames[city.token?.toLowerCase() ?? ''] ?? city.name;
  }

  private regionName(name: string): string {
    return this.regionNames[name] ?? name;
  }

  private cityLabelByName(name: string): string {
    const city = this.cities.list().find((c) =>
      c.name.toLowerCase() === name.toLowerCase() || c.token?.toLowerCase() === name.toLowerCase(),
    );
    return city ? this.cityName(city) : name;
  }

  private gameClock(gameTimeMin: number): string {
    if (!Number.isFinite(gameTimeMin) || gameTimeMin < 0) return '';
    const minutes = Math.floor(gameTimeMin) % 1440;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '时间未知';
    const minutes = Math.max(1, Math.round(seconds / 60));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`;
  }

  private navCorrectedKm(t: Ets2Telemetry, remainingKm: number): number {
    const delayS = Math.max(0, this.opts.cfg.navSpeechDelayS || 0);
    // SCS local.scale is game-seconds per real-second. The configured delay is
    // real seconds, so 5 s of speech at scale 15 covers 75 s of game time.
    const scale = Number.isFinite(t.localScale) && t.localScale > 1 ? t.localScale : 15;
    const traveledKm = (Math.max(0, t.truck.speedKmh) / 3600) * delayS * scale;
    return Math.max(0, remainingKm - traveledKm);
  }

  private navText(t: Ets2Telemetry): string {
    if (!t.connected) return '导航：无（遥测未连接）。';
    if (!t.job.active || !t.job.destinationCity) return '导航：无进行中任务。';
    const destination = this.cityLabelByName(t.job.destinationCity);
    const rawRemaining = t.truck.navDistanceM > 0
      ? t.truck.navDistanceM / 1000
      : this.navHadDistance
        ? 0
        : t.job.plannedDistanceKm;
    const remaining = this.navCorrectedKm(t, rawRemaining);
    return `导航：目的地 ${destination}，剩余约 ${fmt(remaining, 1)} 公里，预计 ${this.formatDuration(t.truck.navTimeS)}。`;
  }

  private maybeVehicleWelcome(t: Ets2Telemetry): void {
    if (!this.opts.cfg.eventsEnabled || !this.opts.cfg.vehicleWelcomeEnabled) return;
    const identity = vehicleIdentity(t.truck.brand, t.truck.truckName, t.truck.truckId);
    if (!identity || identity === '|') return;
    if (this.vehicleWelcomeAnnounced.has(identity)) return;
    // Wait for this truck's engine start. A truck changed while the engine is
    // already running is also a new first-start for this session.
    if (!t.truck.engineOn) return;
    this.vehicleWelcomeAnnounced.add(identity);
    const brand = vehicleBrandName(t.truck.brand, t.truck.truckName);
    const currentCity = this.cities.current;
    const parts = [`${this.short} 车辆启动：${brand}。`];
    if (currentCity) {
      const region = currentCity.country ? `（${this.regionName(currentCity.country)}）` : '';
      parts.push(`当前位置：${this.cityName(currentCity)}${region}。`);
    }
    const clock = this.gameClock(t.gameTimeMin);
    if (clock) parts.push(`游戏时间：${clock}。`);
    this.pushEvent(
      'ets2.vehicle-welcome',
      parts.join(''),
      'debounce',
      {
        kind: 'vehicle',
        vehicle: brand,
        truckId: t.truck.truckId,
        location: currentCity ? this.cityName(currentCity) : null,
        gameTime: clock || null,
      },
    );
  }

  private maybeNavigation(t: Ets2Telemetry): void {
    if (!t.job.active || !t.job.destinationCity) {
      this.navDestination = null;
      this.navMilestones.clear();
      this.navArrived = false;
      this.navHadDistance = false;
      this.navTotalKm = 0;
      this.navProgressBucket = 0;
      return;
    }
    const destination = t.job.destinationCity;
    const navMeters = t.truck.navDistanceM;
    const remaining = Math.max(0, navMeters / 1000);
    const projectedRemaining = this.navCorrectedKm(t, remaining);
    if (this.navDestination !== destination) {
      this.navDestination = destination;
      this.navMilestones.clear();
      this.navArrived = false;
      this.navHadDistance = navMeters > 0;
      const total = t.job.plannedDistanceKm > 0 ? t.job.plannedDistanceKm : remaining;
      this.navTotalKm = total;
      const every = Math.max(50, this.opts.cfg.navProgressEveryKm || 200);
      const traveledAtStart = Math.max(0, total - (navMeters > 0 ? remaining : total));
      this.navProgressBucket = (Math.floor(traveledAtStart / every) + 1) * every;
      // Thresholds already passed before this route starts should not fire.
      const initialRemaining = navMeters > 0 ? projectedRemaining : total;
      for (const threshold of [200, 100, 50, 10]) {
        if (threshold >= initialRemaining) this.navMilestones.add(threshold);
      }
      if (this.opts.cfg.eventsEnabled && this.opts.cfg.navAnnounceEnabled) {
        const eta = t.truck.navTimeS > 0 ? t.truck.navTimeS : (total / 80) * 3600;
        this.pushEvent(
          'ets2.navigation',
          `${this.short} 导航：目的地 ${this.cityLabelByName(destination)}，全程约 ${fmt(total, 1)} 公里，预计 ${this.formatDuration(eta)}。`,
          'debounce',
          { kind: 'nav-start', destination: this.cityLabelByName(destination), remainingKm: remaining },
        );
      }
      return;
    }
    if (!this.opts.cfg.eventsEnabled || !this.opts.cfg.navAnnounceEnabled) return;
    if (navMeters > 0) this.navHadDistance = true;
    // The game reports 0 while the job is not hooked up yet. Do not interpret
    // that as "at the destination" or cross every milestone at once.
    if (!this.navHadDistance) return;
    if (navMeters <= 300 && !this.navArrived) {
      this.navArrived = true;
      this.pushEvent(
        'ets2.navigation',
        `${this.short} 导航：即将到达 ${this.cityLabelByName(destination)}。`,
        'debounce',
        { kind: 'nav-arrival', destination: this.cityLabelByName(destination) },
      );
      return;
    }
    for (const threshold of [200, 100, 50, 10]) {
      if (projectedRemaining <= threshold && !this.navMilestones.has(threshold)) {
        this.navMilestones.add(threshold);
        this.pushEvent(
          'ets2.navigation',
          `${this.short} 导航：距 ${this.cityLabelByName(destination)} 还有约 ${fmt(projectedRemaining, 1)} 公里，预计 ${this.formatDuration(t.truck.navTimeS)}。`,
          'debounce',
          {
            kind: 'nav-milestone',
            destination: this.cityLabelByName(destination),
            remainingKm: projectedRemaining,
            rawRemainingKm: remaining,
            speedKmh: t.truck.speedKmh,
          },
        );
        return;
      }
    }

    const every = Math.max(50, this.opts.cfg.navProgressEveryKm || 200);
    const traveled = Math.max(0, this.navTotalKm - remaining);
    if (traveled >= this.navProgressBucket) {
      this.navProgressBucket = Math.floor(traveled / every) * every + every;
      const fuel = t.truck.fuelRatio == null
        ? `${fmt(t.truck.fuelL, 0)} 升`
        : `${fmt(t.truck.fuelRatio * 100, 0)}%`;
      this.pushEvent(
        'ets2.navigation',
        `${this.short} 导航：已行驶约 ${fmt(traveled, 0)} 公里，当前油量 ${fuel}，距 ${this.cityLabelByName(destination)} 还有约 ${fmt(projectedRemaining, 1)} 公里。`,
        'debounce',
        {
          kind: 'nav-progress',
          destination: this.cityLabelByName(destination),
          traveledKm: traveled,
          fuel,
          remainingKm: projectedRemaining,
        },
      );
    }
  }

  private makeRadar(game: GameKind): RadarBook {
    const suffix = game === 'ats' ? '_ats' : '';
    return new RadarBook(
      join(this.opts.dataDir, `${game}-radar-points.json`),
      this.opts.cfg,
      this.asset(`radar_points${suffix}.json`),
    );
  }

  private makeCities(game: GameKind): CityBook {
    const suffix = game === 'ats' ? '_ats' : '';
    return new CityBook(
      join(this.opts.dataDir, `${game}-cities.json`),
      this.opts.cfg,
      this.asset(`cities${suffix}.json`),
    );
  }

  private makeCountries(game: GameKind): CountryBook {
    return new CountryBook(this.asset(`borders${game === 'ats' ? '_ats' : ''}.json`));
  }

  /** Switch datasets when telemetry reports a different SCS game. */
  private applyGame(game: number): void {
    const kind = gameKind(game);
    if (kind === this.game) return;
    this.game = kind;
    this.engine = new EventEngine(this.opts.cfg);
    this.radar = this.makeRadar(kind);
    this.cities = this.makeCities(kind);
    this.countries = this.makeCountries(kind);
    this.introducedCities.clear();
    this.introducedCountries.clear();
    this.vehicleWelcomeAnnounced.clear();
    this.navDestination = null;
    this.navMilestones.clear();
    this.navArrived = false;
    this.navHadDistance = false;
    this.navTotalKm = 0;
    this.navProgressBucket = 0;
    // Let the first tick of the new game emit its own connected event.
    this.lastConnected = null;
    this.host?.log.info(`Switched SCS World dataset to ${kind}.`);
  }

  private get short(): string {
    return gameShort(this.game);
  }

  private get title(): string {
    return gameTitle(this.game);
  }

  private get region(): string {
    return gameRegion(this.game);
  }

  envPromptVars(): Record<string, string> | null {
    const t = this.latest;
    if (!t) {
      return {
        'game.title': this.title,
        'game.short': this.short,
        'ets2.status': `${this.short} 遥测：未连接（请启动游戏并进入驾驶界面）。`,
        'ets2.job': '当前任务：未知。',
        'ets2.city': '当前城市：未知（遥测未连接）。',
        'ets2.nav': '导航：无（遥测未连接）。',
        'ets2.radar': `电子狗：${this.radar.count} 个点位。`,
        'ets2.recent': '最近事件：无。',
      };
    }
    if (!t.connected) {
      return {
        'game.title': this.title,
        'game.short': this.short,
        'ets2.status': `${this.short} 遥测：共享内存未连接（游戏可能没开，或没进驾驶界面）。`,
        'ets2.job': '当前任务：未知。',
        'ets2.city': '当前城市：未知（遥测未连接）。',
        'ets2.nav': this.navText(t),
        'ets2.radar': `电子狗：${this.radar.count} 个点位。`,
        'ets2.recent': this.recentText(3),
      };
    }
    const tr = t.truck;
    const limit = tr.speedLimitKmh > 1 ? `，限速 ${fmt(tr.speedLimitKmh)}` : '';
    const paused = t.paused ? '（游戏暂停）' : '';
    const status =
      `${this.short} 遥测已连接${paused}：${fmt(tr.speedKmh)} km/h${limit}，` +
      `档位 ${tr.displayedGear || tr.gear}，油量 ${tr.fuelRatio == null ? '--' : `${fmt(tr.fuelRatio * 100)}%`}，` +
      `车损 ${fmt(tr.damageMax * 100, 1)}%，总里程 ${fmt(tr.odometerKm)} 公里。`;
    const job = t.job.destinationCity
      ? `当前任务：${t.job.cargo || '货物'}，${t.job.sourceCity || '?'} → ${t.job.destinationCity}，` +
        `剩余约 ${fmt(t.truck.navDistanceM / 1000, 1)} 公里，运费 €${fmt(t.job.income)}。`
      : '当前任务：没有接单。';
    const radar = `电子狗：${this.radar.count} 个点位；${this.radar.lastHit ? `上次提醒：${this.radar.lastHit.text}` : '最近没有提醒。'}`;
    const currentCity = this.cities.current;
    return {
      'game.title': this.title,
      'game.short': this.short,
      'ets2.status': status,
      'ets2.job': job,
      'ets2.city': currentCity
        ? `当前城市：${this.cityName(currentCity)}（距中心约 ${Math.round(Math.hypot(tr.world.x - currentCity.x, tr.world.z - currentCity.z))} 米）。`
        : `当前城市：不在已记录的城市范围内（本地共 ${this.cities.count} 个城市）。`,
      'ets2.nav': this.navText(t),
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
      label: zh
        ? `${this.short} ${this.game === 'ats' ? '美卡' : '欧卡'}桌宠副驾`
        : `${this.short} ${this.game === 'ats' ? 'American Truck' : 'Euro Truck'} Copilot`,
      panels: [
        {
          id: 'install',
          title: zh ? '遥测安装' : 'Telemetry installer',
          description: zh
            ? '选择 ETS2 或 ATS 游戏根目录，一键下载并安装 scs-telemetry.dll。安装后重启游戏生效。'
            : 'Pick the ETS2 or ATS game folder to download and install scs-telemetry.dll. Restart the game afterwards.',
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
          this.applyGame(telemetry.game);
          this.setConnected(telemetry.connected);
          if (telemetry.connected && !telemetry.paused) {
            this.maybeNavigation(telemetry);
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
                `${this.short} 进入城市：${this.cityName(enteredCity)}${suffix}`,
                'debounce',
                { kind: 'city', city: this.cityName(enteredCity), firstVisit, repeatIntro },
              );
            }
            this.maybeVehicleWelcome(telemetry);
            const crossing = this.countries.detect(telemetry);
            if (crossing && this.opts.cfg.countryAnnounceEnabled) {
              const key = crossing.country.toLowerCase();
              const firstVisit = !this.introducedCountries.has(key);
              if (firstVisit) this.introducedCountries.add(key);
              const repeatIntro = !firstVisit && this.opts.cfg.countryRepeatIntro;
              const suffix = firstVisit
                ? '首次到达，可简短介绍'
                : repeatIntro
                  ? '再次到达，可再简短介绍'
                  : '已介绍过，简短报到即可';
              const countryName = this.regionName(crossing.country);
              const fromName = this.regionName(crossing.fromCountry);
              this.pushEvent(
                this.game === 'ats' ? 'ets2.state-entered' : 'ets2.country-entered',
                `${this.short} 进入${this.region}：${countryName}（从${fromName}方向，${suffix}）`,
                'debounce',
                {
                  kind: this.game === 'ats' ? 'state' : 'country',
                  country: countryName,
                  fromCountry: fromName,
                  firstVisit,
                  repeatIntro,
                },
              );
            }
            if (this.opts.cfg.radarEnabled) {
              const hit = this.radar.detect(telemetry);
              if (hit) {
                this.pushEvent(
                  'ets2.radar',
                  `${this.short} 电子狗：${hit.text}`,
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
      this.host?.log.warn(`${this.short} poll failed: ${detail}`);
      this.setConnected(false);
    } finally {
      this.schedule();
    }
  }

  private setConnected(connected: boolean): void {
    if (this.lastConnected === connected) return;
    const first = this.lastConnected === null;
    // A real disconnect means the game was closed or returned to the menu;
    // the next connected engine start is a new welcome session.
    if (!connected && this.lastConnected === true) this.vehicleWelcomeAnnounced.clear();
    this.lastConnected = connected;
    if (first && !connected) return;
    this.pushEvent(
      'ets2.connection',
      connected
        ? `${this.short} 遥测已连接，可以读取车况了。`
        : `${this.short} 遥测断开（游戏关闭或退回菜单）。`,
      'debounce',
      { kind: 'connection', connected },
    );
  }

  private pushGameEvent(event: GameEvent): void {
    this.pushEvent(
      ETS2_EVENT_TYPES[event.kind],
      event.text.replace(/^ETS2\b/, this.short),
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
      ? `当前在 ${this.cityName(current)}（半径 ${current.radiusM} 米）`
      : `当前不在已记录的城市范围内（本地共 ${this.cities.count} 个）`;
    if (!rows.length) return `${head}。还没有城市记录：接单/送达会自动学习，或在「城市记录」面板手动记录。`;
    return [
      head,
      ...rows.map((p) => {
        const distance = p.distanceM == null ? '--' : `${fmt(p.distanceM)} m`;
        return `${this.cityName(p)}（${p.source === 'manual' ? '手动' : '自动'}，${distance}，半径 ${p.radiusM} m）`;
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
      return `${this.short} 遥测未连接：${hint}`;
    }
    if (!t.connected) return `${this.short} 共享内存没连上：确认 scs-telemetry.dll 在 bin\\win_x64\\plugins。`;
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
    if (!recent.length) return `没有 ${this.short} 事件。`;
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
