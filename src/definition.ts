import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { ETS2_DEFAULTS, type Ets2ConfigSection } from './config.ts';
import {
  ETS2_WORLD_ID,
  Ets2World,
  TOOL_DECLS,
} from './world.ts';

const EVENT_DESCRIPTIONS = [
  ['ets2.connection', 'ETS2 遥测连接或断开。', 'ETS2 telemetry connected or disconnected.'],
  ['ets2.job-started', '接到新任务。', 'A new ETS2 job was started.'],
  ['ets2.job-delivered', '任务送达。', 'An ETS2 job was delivered.'],
  ['ets2.job-cancelled', '任务取消。', 'An ETS2 job was cancelled.'],
  ['ets2.speeding', '超过当前限速。', 'The truck is above the current speed limit.'],
  ['ets2.low-fuel', '油量低于阈值。', 'Fuel is below the configured threshold.'],
  ['ets2.accident', '检测到车损跳变/撞击。', 'A damage jump/accident was detected.'],
  ['ets2.fine', '收到罚款。', 'An ETS2 fine was reported.'],
  ['ets2.tollgate', '经过收费站。', 'The truck passed a tollgate.'],
  ['ets2.ferry', '上/下渡轮。', 'The job uses a ferry.'],
  ['ets2.train', '上/下火车。', 'The job uses a train.'],
  ['ets2.refuel', '加油。', 'The truck was refuelled.'],
  ['ets2.city-arrival', '接近任务目的地。', 'The truck is approaching the destination city.'],
  ['ets2.radar', '电子狗提醒。', 'A stored radar/POI point is ahead.'],
] as const;

export const ETS2_DEFINITION: WorldDefinition<Ets2ConfigSection> = {
  id: ETS2_WORLD_ID,
  label: 'ETS2 大肥鱼副驾',
  defaults: () => ({ ...ETS2_DEFAULTS }),
  create: (ctx) =>
    new Ets2World({
      cfg: ctx.cfg,
      dataDir: ctx.dataDir,
      timezone: ctx.timezone,
      persist: (patch) => ctx.persist(patch),
    }),
  describe: {
    tools: describeTools(TOOL_DECLS, {
      ets2_status: {
        zh: '读取当前欧卡2车况、任务和电子狗状态。',
        en: 'Reads the current ETS2 truck, job and radar status.',
      },
      ets2_recent_events: {
        zh: '返回最近的欧卡2事件。',
        en: 'Returns recent ETS2 events.',
      },
      ets2_radar_points: {
        zh: '列出最近的测速/收费站/称重点。',
        en: 'Lists the nearest radar/POI points.',
      },
      ets2_record_radar: {
        zh: '把卡车当前位置记成电子狗点位。',
        en: 'Records the truck’s current position as a radar point.',
      },
      ets2_install_telemetry: {
        zh: '下载并安装/修复欧卡2的 scs-telemetry.dll。',
        en: 'Downloads and installs/repairs the ETS2 scs-telemetry.dll.',
      },
    }),
    events: EVENT_DESCRIPTIONS.map(([type, zh, en]) => ({
      type,
      description: { zh, en },
    })),
  },
};
