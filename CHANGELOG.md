# Changelog

## 0.2.0

- Added the **遥测安装 / Telemetry installer** panel: pick the ETS2 game folder, download the latest
  RenCloud `scs-sdk-plugin` release and install/repair `scs-telemetry.dll` in
  `bin\win_x64\plugins`.
- Added `ets2_install_telemetry` tool for Coo.
- Added `gameRoot` and `autoInstallTelemetry` settings.
- Existing DLL is backed up before being replaced; the game must be restarted after installation.

## 0.1.0

- First native Node/TypeScript World.
- Reads SCS telemetry from `Local\SCSTelemetry` via koffi.
- Vehicle, job, navigation and event support for Coo.
- 415 map-derived radar/POI points plus user-recorded points.
- Tools: `ets2_status`, `ets2_recent_events`, `ets2_radar_points`, `ets2_record_radar`.
