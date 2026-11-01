# 欧卡/美卡桌宠副驾（cortico-world-ets2-dafeiyu）

《欧洲卡车模拟 2》和《美国卡车模拟》的 **Coopanion / Cortico World 副驾**。它读取 SCS 官方遥测共享内存，按遥测里的 `game` 字段自动切换 ETS2 / ATS 数据，把车况和游戏事件交给桌宠 **Coo**。

这是**方案 B：原生 Node + TypeScript** 版本：不依赖 Python、不需要外部仪表盘、不需要豆包 Key；播报由 Coo 自己完成。

当前版本：**1.0.3**

- npm：https://www.npmjs.com/package/cortico-world-ets2-dafeiyu
- 源码：https://github.com/minekooooo/euro-truck2-coopanion
- 市场收录：https://github.com/Pal-AI-Lab/cortico-extensions/blob/main/packages/cortico-world-ets2-dafeiyu.json

## 功能

- **车况**：速度、限速、档位、转速、油量、AdBlue、车损、总里程、定速巡航。
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
- **电子狗**：ETS2 内置 415 个官方地图点位（70 个测速/违章摄像头、297 个收费站、48 个称重点）；ATS 内置 541 个（15 个测速/违章、41 个收费站、485 个称重点）。支持把当前位置记成用户点位。
- **导航阶段一**：有任务时用游戏导航的剩余距离/时间播报起点、200/100/50/10 公里节点、每 200 公里进度、ETA 和到达；进度播报当前油量、剩余里程和一句简短夸奖；节点距离按当前车速、游戏 `local.scale` 和 `navSpeechDelayS`（现实秒）做播报延迟修正；接单但还没挂车、导航距离为 0 时不会误报 0 公里；不做转弯播报，本地路线和偏航重算见「地图与路网面板」。
- **车辆启动欢迎**：每次进入游戏后，每辆卡车第一次启动引擎时，由 Coo 结合车型、能识别到的当前位置和游戏时间自己开场；识别不到位置就省略位置。

## 双游戏数据

插件按遥测 `game` 自动切换，坐标库不会混用：

| 数据 | ETS2 | ATS |
|---|---:|---:|
| 城市 | 380 | 270 |
| 边境/州界 | 184 个国家边境点 | 229 个州界点 |
| 电子狗 POI | 415 | 541 |

- ETS2 数据：`assets/cities.json`、`assets/borders.json`、`assets/radar_points.json`
- ATS 数据：`assets/cities_ats.json`、`assets/borders_ats.json`、`assets/radar_points_ats.json`
- 用户数据也按游戏分开：`ets2-cities.json` / `ats-cities.json`、`ets2-radar-points.json` / `ats-radar-points.json`
- ATS 过境事件是 `ets2.state-entered`（州界），ETS2 是 `ets2.country-entered`（国界）
- 本地中文名：`assets/zh_names.json`，目前覆盖 557 个城市和 166 个国家/州名；没有映射的地名回退到地图原名

- 公司坐标自学习：接货记录起点公司、送达记录终点公司；按城市 ID + 公司 ID 聚类保存，后续接单优先使用学习点
- 本地路线终点优先使用公司 POI / 学习点，找不到时才回退到城市中心；暂停状态下也会加载并推送当前路线
- 本地预览页支持实时车辆跟随、车头朝上/北朝上、重新居中；这是二维地图跟随，不是车道级导航
- 本地地图支持行程看板、服务设施/景点/渡轮/公司/电子狗图层、城市/国家/村庄开关、偏航连线和行驶轨迹
- 接近景点/观景点时播报名称、类型和距离；每次进入附近可再次简短介绍，由 Coo 完成
- ETS2 / ATS 各自使用本游戏的地图、设施、景点和路网数据；POI 坐标已修正 MVT Y 翻转

## 运行要求

- Windows 10/11 x64（SCS 遥测 DLL + 共享内存）
- 《欧洲卡车模拟 2》或《美国卡车模拟》，且 `scs-telemetry.dll` 位于：
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
→ 在 World 页启用「欧卡/美卡桌宠副驾」
```

World 默认是关闭的，需要手动启用。

本地开发安装：

1. 先在包目录执行 `npm install`
2. Coopanion → 扩展 → 本机目录 → 选择这个文件夹
3. 重启 Coopanion 后启用 World

注意：Coopanion 的「本机目录」只做 link，不会自动安装依赖，所以必须先有 `node_modules/koffi`。

## 遥测安装

如果游戏目录里还没有 `scs-telemetry.dll`，不用手动去 GitHub 下载：

1. 打开 Coopanion 的 World 页 →「欧卡/美卡桌宠副驾」→「遥测安装」面板
2. 点「浏览…」，选择游戏根目录（包含 `bin\win_x64\eurotrucks2.exe` 或 `amtrucks.exe` 的目录，
   通常是 `...\steamapps\common\Euro Truck Simulator 2` 或
   `...\steamapps\common\American Truck Simulator`）
3. 点「一键安装 / 修复」
4. 安装完成后**重启游戏**

安装器会：

- 从 [RenCloud/scs-sdk-plugin](https://github.com/RenCloud/scs-sdk-plugin) 的 Releases 取最新 release
- 解压出 `Win64/scs-telemetry.dll`
- 写入 `<游戏根目录>\bin\win_x64\plugins\scs-telemetry.dll`
- 如果已有旧 DLL，先备份成 `scs-telemetry.dll.bak-时间`

游戏根目录和「启动时自动安装」都只放在这个「遥测安装」面板里，不会在配置页重复出现。  
Coo 也可以调用工具 `ets2_install_telemetry` 完成同样的安装。

## 城市记录

ETS2 遥测没有“当前城市”字段，所以插件用城市坐标 + 世界坐标做地理围栏：

- 内置 **380 个官方地图城市**（`assets/cities.json`），从 `base_map.scs` 和各 DLC 的
  `CityArea` 提取，安装后即可识别，不需要先跑任务
- 打开 World 页 →「城市记录」面板，可以看当前城市、搜索/查看本地城市
- 站在城里，填城市名和半径，点「记录当前位置」，可覆盖内置城市
- 接单时自动记录**起点城市**，送达时自动记录**终点城市**；只补空缺，不会覆盖手动记录
- 进入城市范围时，Coo 收到 `ets2.city-entered` 事件并播报
- 第一次到达某个城市时，事件会标注「可简短介绍」，让 Coo 用一两句话介绍城市
- 之后再进入：`cityRepeatIntro` 关闭时只标注「已介绍过」；打开时标注「可再简短介绍」
- 第一次加载存档时如果已经在城里，会静默把当前城市设进去，避免一进游戏就重复播报
- 「只介绍一次」按本次 Coopanion 运行计算，重启后会重新算首次

数据位置：

```text
内置：assets/cities.json（随 npm 包发布）
用户：<Coopanion 数据目录>/ets2-cities.json（手动/自动补充与覆盖）
```

内置城市不会被用户文件覆盖，只有你手动记录同名城市时才覆盖。城市半径来自地图 `CityArea`
的实际宽高，约 500–4000 米；遇到奇怪的范围可以在面板里手动重记。

## 国家边境 / 州界

`assets/borders.json` 从地图节点的 `Node.IsCountryBorder` 生成，ETS2 目前有 **184 个道路边境点**，
覆盖 48 个国家记录。每个点包含：

- 世界坐标 `x/z`
- 道路前进方向的法线 `nx/nz`
- `forwardCountry` / `backwardCountry`
- 两侧国家名

检测方式：

- 用上一帧和当前帧位置算道路两侧的 signed distance
- 符号翻转且交点落在边境点附近 80 米道路走廊内，才算一次过境
- 按运动方向判断进入的是 `forwardCountry` 还是 `backwardCountry`
- 超过 500 米的位置跳变（读档、渡轮等）直接忽略
- 同一个边境点 30 秒冷却

进入国家时推送 `ets2.country-entered`，首次到达会让 Coo 简短介绍；重复进入按
`countryRepeatIntro` 决定是否再介绍。

限制：

- 边境点是**道路上的过境点**，不是完整国家边界多边形
- 渡轮、海上、地图边缘没有道路节点的边境不会覆盖
- 地图 mod 的边境点需要单独解析

## 地图与路网面板

Coopanion 的 World 页里有「地图与路网」面板：

- 选择 ETS2 / ATS 数据
- 下载/删除当前游戏的地图视觉数据（PMTiles）
- 下载/删除当前游戏的路网数据（graph/geometry）
- 开关地图入口、视觉数据、路网、本地导航服务
- 游戏退出 30 秒后自动关闭地图服务
- 手动启动/停止地图服务
- 学习公司终点坐标
- 修改本地导航服务地址、偏航距离
- 调整低油、休息、车损提醒阈值

下载地图视觉后会新增：

- 游戏地图、城市、国家/边境、景点、设施、渡轮、公司、电子狗图层
- 实时车辆跟随、行程看板、行驶轨迹、偏航连线

下载路网后会新增：

- 本地 TruckNav 路线
- 偏航重算
- 加油/休息/车损的前方设施距离播报

地图视觉数据约 10–13 MB/游戏；路网数据约 70–77 MB/游戏。  
地图数据不随 npm 包发布，按游戏按需下载。

## 配置

配置段：`worlds.ets2-dafeiyu`

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `eventsEnabled` | true | 是否推送游戏事件 |
| `cityAnnounceEnabled` | true | 进入城市范围时是否播报 |
| `cityLearnEnabled` | true | 接单/送达时自动学习城市坐标 |
| `cityRadiusM` | 1500 | 城市默认半径（米） |
| `cityRepeatIntro` | false | 重复进入同一城市时是否再次介绍 |
| `countryAnnounceEnabled` | true | 是否播报国家/州边境 |
| `countryRepeatIntro` | false | 重复进入同一国家/州时是否再次介绍 |
| `navAnnounceEnabled` | true | 是否播报导航距离/ETA |
| `navSpeechDelayS` | 8 | 现实秒；按当前车速和游戏 local.scale 修正里程碑距离 |
| `navProgressEveryKm` | 200 | 每行驶多少公里播报油量、剩余里程和夸奖 |
| `fuelAlertRatio` | 0.30 | 低油量提醒阈值（也可在地图面板调整） |
| `restAlertMinutes` | 120 | 剩余多少游戏分钟时提醒休息（也可在地图面板调整） |
| `damageAlertRatio` | 0.40 | 车辆受损提醒阈值（也可在地图面板调整） |

地图相关配置已移到「地图与路网」面板：

```text
mapUiEnabled
mapVisualEnabled
routeDataEnabled
navServiceEnabled
navServiceUrl
navOffRouteM
companyLearningEnabled
fuelAlertRatio
restAlertMinutes
damageAlertRatio
```
| `vehicleWelcomeEnabled` | true | 每辆卡车每次进游戏第一次启动引擎是否欢迎 |
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

## 致谢

本项目的遥测、地图和路线功能离不开这些开源项目与数据：

### 遥测 DLL

SCS 遥测插件由 **RenCloud/scs-sdk-plugin** 提供，安装器会从 Releases 下载并安装 `Win64/scs-telemetry.dll`：

- 项目：https://github.com/RenCloud/scs-sdk-plugin

DLL 不随本插件打包，安装器只负责下载和写入游戏目录。

### 地图与路线

TruckNav 提供了 SCS 地图路网、A* 路线、转向数据和地图瓦片格式的参考实现。  
本地路网和 PMTiles 数据仅用于本地测试，不随 npm 包发布。

- TruckNav-Sim：https://github.com/Rares-Muntean/TruckNav-Sim

TruckNav 地图数据遵循 **GPL-3.0**。本插件不把地图/路网大数据打进 npm 包；如需分发地图数据，请单独遵守其许可证。

### 地图渲染与瓦片

- MapLibre GL JS：https://github.com/maplibre/maplibre-gl-js
- PMTiles：https://github.com/protomaps/PMTiles

### SCS Software

Euro Truck Simulator 2 和 American Truck Simulator 的商标与游戏内容归 SCS Software 所有。  
本项目与 SCS Software、Pal AI Lab / Coopanion 没有隶属关系。

## 许可证

MIT。

本项目和 SCS Software、Euro Truck Simulator 2、Pal AI Lab / Coopanion 没有隶属关系。
