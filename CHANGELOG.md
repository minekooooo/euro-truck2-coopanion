# Changelog

## 0.3.0

- Added local **city geofences**: record a city at the truck's current position, or learn it from job
  source/destination endpoints.
- Added `ets2.city-entered` events with a configurable city radius (default 1500 m).
- Added the **城市记录 / City records** panel and `ets2_cities` / `ets2_record_city` tools.
- City data is stored in `<Coopanion data dir>/ets2-cities.json`; the first tick inside a city is
  silent so loading a save does not spam the pet.

## 0.2.5

- Added Chinese package description and `cortico.locales` (zh/en), so Coopanion and the market show
  Chinese text for the default Chinese interface.

## 0.2.4

- Renamed the display name to **ETS2 欧卡桌宠副驾**. The npm package name and World id
  (`ets2-dafeiyu`) stay unchanged so existing installs and settings keep working.

## 0.2.3

- Replaced the plugin icon with the new blue-haired Coo illustration.

## 0.2.2

- Removed the duplicate `gameRoot` and `autoInstallTelemetry` fields from the World config page.
  Both are now managed only by the **遥测安装** panel; the values still persist in
  `worlds.ets2-dafeiyu` and are used by auto-install.

## 0.2.1

- Installer status is now scoped to the selected game folder, so switching folders does not show an
  old install result from another path.
- Documentation updated for the installer panel and local `npm install` requirement.

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
