import type { ConfigGroup } from 'cortico/core/types.ts';

export interface Ets2ConfigSection {
  enabled: boolean;
  /** ETS2 game root; used by the telemetry installer. */
  gameRoot: string;
  /** Install scs-telemetry.dll automatically on World start when it is missing. */
  autoInstallTelemetry: boolean;
  /** Announce entering a city geofence. */
  cityAnnounceEnabled: boolean;
  /** Learn city centres from job source/destination endpoints. */
  cityLearnEnabled: boolean;
  /** Default city geofence radius in metres. */
  cityRadiusM: number;
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
  cityAnnounceEnabled: true,
  cityLearnEnabled: true,
  cityRadiusM: 1500,
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
    title: 'ETS2 欧卡桌宠副驾',
    description: '读取 SCS 遥测，向 Coo 报告欧卡2的车况、事件和电子狗点位。',
    properties: {
      'worlds.ets2-dafeiyu.eventsEnabled': {
        type: 'boolean',
        title: '事件播报',
        description: '事故、超速、低油、罚款、收费站、任务、到城。',
      },
      'worlds.ets2-dafeiyu.cityAnnounceEnabled': {
        type: 'boolean',
        title: '进入城市播报',
        description: '根据本地城市坐标，进入城市范围时交给桌宠播报。',
      },
      'worlds.ets2-dafeiyu.cityLearnEnabled': {
        type: 'boolean',
        title: '自动学习城市坐标',
        description: '接单时记录起点城市、送达时记录终点城市；只补空缺，不改手动记录。',
      },
      'worlds.ets2-dafeiyu.cityRadiusM': {
        type: 'integer',
        title: '城市范围半径（米）',
        description: '默认 1500 米；越小越不容易误报，但郊区可能进不了范围。',
        minimum: 200,
        maximum: 5000,
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
