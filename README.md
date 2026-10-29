# cortico-world-ets2-dafeiyu

《欧洲卡车模拟 2》的 **Coopanion / Cortico World 副驾**。它读取 SCS 官方遥测共享内存，把车况和游戏事件交给桌宠 **Coo**，并提供车况查询、最近事件和电子狗点位工具。

- npm：https://www.npmjs.com/package/cortico-world-ets2-dafeiyu
- 源码：https://github.com/minekooooo/euro-truck2-coopanion
- 市场收录：https://github.com/Pal-AI-Lab/cortico-extensions/blob/main/packages/cortico-world-ets2-dafeiyu.json
- 游戏数据来源为欧卡的遥测数据，链接：https://github.com/RenCloud/scs-sdk-plugin/releases
## 功能

- **车况**：速度、限速、档位、转速、油量、车损、总里程、定速巡航。
- **任务**：货物、起点/终点城市与公司、剩余距离、运费、货损。
- **推送给 Coo 的事件**：
  - 接单 / 送达 / 任务取消
  - 超速
  - 低油
  - 事故（车损跳变）
  - 罚款、收费站、渡轮、火车、加油
  - 接近目的地
  - 电子狗前方有点位
  - 遥测连接 / 断开
- **给 Coo 的工具**：
  - `ets2_status`
  - `ets2_recent_events`
  - `ets2_radar_points`
  - `ets2_record_radar`
- **电子狗**：内置 415 个官方地图点位（70 个测速/违章摄像头、297 个收费站、48 个称重点），并支持把当前位置记成用户点位，保存在 Coopanion 数据目录。

## 运行要求

- Windows 10/11 x64（SCS 遥测 DLL + 共享内存）
- 《欧洲卡车模拟 2》，且 `scs-telemetry.dll` 位于：
  `...\bin\win_x64\plugins\`
- Coopanion / Cortico，World API 6（当前 0.2.x）
- Node 22+（Cortico 安装扩展时使用自带运行时）

本插件只读取官方遥测，**不注入游戏、不修改游戏内存、不读取其他进程**。

## 安装

从 npm 市场安装：

```text
Coopanion → 设置 → 高级模式 → 扩展
→ 搜索 cortico-world-ets2-dafeiyu
→ 安装 → 重启 Coopanion
→ 在 World 页启用「ETS2 大肥鱼副驾」
```

World 默认是关闭的，需要手动启用。

本地开发安装：

1. 先在包目录执行 `npm install`
2. Coopanion → 扩展 → 本机目录 → 选择这个文件夹
3. 重启 Coopanion 后启用 World

注意：Coopanion 的「本机目录」只做 link，不会自动安装依赖，所以必须先有 `node_modules/koffi`。

## 配置

配置段：`worlds.ets2-dafeiyu`

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `eventsEnabled` | true | 是否推送游戏事件 |
| `radarEnabled` | true | 是否启用电子狗 |
| `pollMs` | 200 | 遥测轮询间隔（毫秒） |
| `speedingToleranceKmh` | 5 | 超速容差 |
| `speedingCooldownS` | 25 | 超速提醒冷却 |
| `lowFuelThreshold` | 0.15 | 低油阈值（0–1） |
| `accidentDamageDelta` | 0.002 | 事故车损跳变阈值 |
| `cityArrivalDistanceM` | 1200 | 到城提醒距离 |
| `radarRadiusM` | 500 | 电子狗默认半径 |
| `radarCooldownS` | 120 | 同一点位冷却 |
| `radarMinSpeedKmh` | 10 | 低于该车速不提醒 |
| `radarWarnIntervalS` | 5 | 两次电子狗提醒的最小间隔 |

## 电子狗数据

`assets/radar_points.json` 由官方 `base_map.scs` 与 DLC 地图的 `Trigger` 生成：

- `offence` → 测速/违章摄像头（70）
- `toll_start` / `toll_onetime` → 收费站（297）
- `weigh` → 称重点（48）

这些坐标**不是**从 `RADAR-DETECTOR` 声音 mod 里读的；那个 mod 只播放自己的音效，不暴露坐标。部分国家/DLC 没有 `offence` 触发器，所以摄像头覆盖不完整；可以用 `ets2_record_radar` 或罚款后的手动记录补充。

用户点位保存在：

```text
<Coopanion 数据目录>/ets2-radar-points.json
```

不会写进 npm 包。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run describe:extension
npm pack --dry-run
```

这是一个标准的 `cortico-world` npm 包。`package.json` 里的 `cortico` 块：

- `kind: "world"`
- `api: 6`
- 标签：`game` + `apps`
- `os: ["win32"]`

## 发布与市场

```bash
npm publish --access public
```

发布后如果市场还没显示，在 [Pal-AI-Lab/cortico-extensions](https://github.com/Pal-AI-Lab/cortico-extensions) 开一个 `[sync]` issue：

```text
[sync] cortico-world-ets2-dafeiyu
```

需要认证时再开 `[certify]` issue。市场索引有缓存，通常最多 10 分钟显示。

## 许可证

MIT。

本项目和 SCS Software、Euro Truck Simulator 2、Pal AI Lab / Coopanion 没有隶属关系。
