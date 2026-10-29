# cortico-world-ets2-dafeiyu

Cortico / Coopanion World for **Euro Truck Simulator 2**. It reads the official SCS telemetry
shared memory, turns it into events for **Coo**, and exposes tools for status, recent events and
a learned / map-derived radar detector.

This is the native **Node + TypeScript** version (plan B): no Python, no external dashboard, no
Doubao key. Coo does the speaking.

## What it does

- **Vehicle status**: speed, speed limit, gear, RPM, fuel, AdBlue, damage, odometer, cruise.
- **Job**: cargo, source/destination city and company, remaining distance, income, cargo damage.
- **Events pushed to Coo**:
  - job started / delivered / cancelled
  - speeding
  - low fuel
  - accident (damage jump)
  - fine, tollgate, ferry, train, refuel
  - approaching destination
  - radar/POI ahead
  - telemetry connected / disconnected
- **Tools for Coo**:
  - `ets2_status`
  - `ets2_recent_events`
  - `ets2_radar_points`
  - `ets2_record_radar`
- **Radar**: 415 official-map POIs (70 speed/offence cameras, 297 tolls, 48 weigh points) plus
  user-recorded points saved in Coopanion's data directory.

## Requirements

- Windows 10/11 x64 (SCS telemetry DLL + shared memory)
- Euro Truck Simulator 2 with `scs-telemetry.dll` in
  `...\bin\win_x64\plugins\`
- Coopanion / Cortico with World API 6 (current 0.2.x)
- Node 22+ (Cortico extension install uses its own runtime)

The plugin uses only **read-only** official telemetry. It does not inject into the game, modify
its memory or read other processes.

## Install

From npm (once published):

```text
Coopanion → 设置 → 高级模式 → 扩展 → 搜索 cortico-world-ets2-dafeiyu → 安装 → 重启
```

Then enable **ETS2 大肥鱼副驾** in the World page. It starts disabled by default, as required for
Worlds.

For local development, use Coopanion's extension page → “本机目录” and select this folder.

## Configuration

`worlds.ets2-dafeiyu`:

| key | default | meaning |
|---|---|---|
| `eventsEnabled` | true | game event reports |
| `radarEnabled` | true | radar/POI warnings |
| `pollMs` | 200 | telemetry poll interval |
| `speedingToleranceKmh` | 5 | speed tolerance |
| `speedingCooldownS` | 25 | per-warning cooldown |
| `lowFuelThreshold` | 0.15 | low fuel ratio |
| `accidentDamageDelta` | 0.002 | damage jump threshold |
| `cityArrivalDistanceM` | 1200 | destination warning distance |
| `radarRadiusM` | 500 | default radar radius |
| `radarCooldownS` | 120 | per-point cooldown |
| `radarMinSpeedKmh` | 10 | do not warn while stopped |
| `radarWarnIntervalS` | 5 | minimum interval between radar calls |

## Radar data

`assets/radar_points.json` is generated from official `base_map.scs` and DLC map `Trigger` items:

- `offence` → speed/offence cameras (70)
- `toll_start` / `toll_onetime` → tolls (297)
- `weigh` → weigh stations (48)

It is **not** read from the `RADAR-DETECTOR` sound mod; that mod only plays its own sounds and does
not expose coordinates. Some countries/DLCs do not expose `offence` triggers, so camera coverage is
incomplete; use `ets2_record_radar` or a fine to add missing points.

User points are stored in `<Coopanion data dir>/ets2-radar-points.json`, never in the package.

## Development

```bash
npm install
npm run typecheck
npm test
npm run describe:extension
npm pack --dry-run
```

The package is a normal `cortico-world` npm package. `package.json` contains the `cortico` block
(`kind: "world"`, `api: 6`, tags `game` + `apps`, `os: ["win32"]`).

## Market

Publish with `npm publish --access public`, then open a `[sync]` issue in
[Pal-AI-Lab/cortico-extensions](https://github.com/Pal-AI-Lab/cortico-extensions) if it does not
appear immediately. Optional `[certify]` requests certification.

## License

MIT. ETS2 / SCS Software and Coopanion / Pal AI Lab are not affiliated with this package.
