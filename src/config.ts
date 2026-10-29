import type { ConfigGroup } from 'cortico/core/types.ts';

export interface Ets2ConfigSection {
  enabled: boolean;
  /** ETS2 game root; used by the telemetry installer. */
  gameRoot: string;
  /** Install scs-telemetry.dll automatically on World start when it is missing. */
  autoInstallTelemetry: boolean;
  pollMs: number;
  eventsEnabled: boolean;
  radarEnabled: boolean;
  speedingToleranceKmh: number;
  speedingCooldownS: number;
  lowFuelThreshold: number;
  accidentDamageDelta: number;
  cityArrivalDistanceM: number;
  radarRadiusM: number;
  radarCooldownS: number;
  radarMinSpeedKmh: number;
  radarWarnIntervalS: number;
}

export const ETS2_DEFAULTS: Ets2ConfigSection = {
  enabled: false,
  gameRoot: '',
  autoInstallTelemetry: false,
  pollMs: 200,
  eventsEnabled: true,
  radarEnabled: true,
  speedingToleranceKmh: 5,
  speedingCooldownS: 25,
  lowFuelThreshold: 0.15,
  accidentDamageDelta: 0.002,
  cityArrivalDistanceM: 1200,
  radarRadiusM: 500,
  radarCooldownS: 120,
  radarMinSpeedKmh: 10,
  radarWarnIntervalS: 5,
};

export const ETS2_CONFIG_GROUP: ConfigGroup = {
  id: 'world:ets2-dafeiyu',
  owner: 'world:ets2-dafeiyu',
  schema: {
    type: 'object',
    title: 'ETS2 大肥鱼副驾',
    description: '读取 SCS 遥测，向 Coo 报告欧卡2的车况、事件和电子狗点位。',
    properties: {
      'worlds.ets2-dafeiyu.gameRoot': {
        type: 'string',
        title: '游戏根目录',
        description: '选择包含 bin\\win_x64\\eurotrucks2.exe 的 ETS2 根目录；安装遥测用。',
        'x-path': { kind: 'directory' },
        'x-hot': true,
      },
      'worlds.ets2-dafeiyu.autoInstallTelemetry': {
        type: 'boolean',
        title: '启动时自动安装遥测',
        description: '已选择游戏根目录且缺少 scs-telemetry.dll 时，World 启动后自动下载安装。',
      },
      'worlds.ets2-dafeiyu.eventsEnabled': {
        type: 'boolean',
        title: '事件播报',
        description: '事故、超速、低油、罚款、收费站、任务、到城。',
      },
      'worlds.ets2-dafeiyu.radarEnabled': {
        type: 'boolean',
        title: '电子狗',
        description: '接近已记录/预置的测速、收费站、称重点时提醒。',
      },
      'worlds.ets2-dafeiyu.pollMs': {
        type: 'integer',
        title: '遥测轮询间隔（毫秒）',
        description: '默认 200ms；100–2000。',
        minimum: 100,
        maximum: 2000,
        'x-hot': false,
      },
      'worlds.ets2-dafeiyu.speedingToleranceKmh': {
        type: 'integer',
        title: '超速容差（km/h）',
        description: '超过限速多少才提醒。',
        minimum: 1,
        maximum: 30,
      },
      'worlds.ets2-dafeiyu.speedingCooldownS': {
        type: 'integer',
        title: '超速提醒冷却（秒）',
        minimum: 10,
        maximum: 300,
      },
      'worlds.ets2-dafeiyu.lowFuelThreshold': {
        type: 'number',
        title: '低油阈值（0–1）',
        description: '例如 0.15 = 15%。',
        minimum: 0.05,
        maximum: 0.5,
      },
      'worlds.ets2-dafeiyu.accidentDamageDelta': {
        type: 'number',
        title: '事故车损跳变阈值',
        description: '例如 0.002 = 0.2 个百分点。',
        minimum: 0.0005,
        maximum: 0.1,
      },
      'worlds.ets2-dafeiyu.cityArrivalDistanceM': {
        type: 'integer',
        title: '到城提醒距离（米）',
        minimum: 200,
        maximum: 5000,
      },
      'worlds.ets2-dafeiyu.radarRadiusM': {
        type: 'integer',
        title: '电子狗默认半径（米）',
        minimum: 100,
        maximum: 3000,
      },
      'worlds.ets2-dafeiyu.radarCooldownS': {
        type: 'integer',
        title: '电子狗同点冷却（秒）',
        minimum: 15,
        maximum: 3600,
      },
      'worlds.ets2-dafeiyu.radarMinSpeedKmh': {
        type: 'integer',
        title: '电子狗最低触发车速（km/h）',
        minimum: 0,
        maximum: 80,
      },
    },
  },
};
