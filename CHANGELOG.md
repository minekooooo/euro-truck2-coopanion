# Changelog

## 1.0.3

- 城市、国家/州名称改为中文后附带英文名，例如「柏林（Berlin）」「德国（Germany）」。

## 1.0.2

- 修复地图道路坐标转换，使用真实 WGS84 投影，道路可与车辆、城市和路线对齐。

## 1.0.1

- 更新了一些信息。

## 1.0.0

- First full ETS2 / ATS release with the TruckNav map, route service, POI layers, landmark/facility
  alerts, ATS parity and the plugin-managed map panel.
- The map panel now manages map/road downloads, per-game data status, map switches, local service
  URL, off-route threshold and fuel/rest/damage thresholds.
- Added manual map-service start/stop and automatic shutdown 30 seconds after game disconnect.
  Plugin shutdown also stops the map service.
- Market README: credits simplified to the RenCloud project and TruckNav-Sim; removed per-file
  TruckNav links and the SCS SDK header reference.

## 0.18.1

- Fixed PMTiles POI conversion: flipped the MVT local Y coordinate before converting back to SCS
  game coordinates. This corrects landmark and facility positions for both ETS2 and ATS.
- Regenerated ETS2/ATS landmark and facility assets. Flaming Gorge Dam now matches the truck position
  within a few metres instead of being 6.7 km away.

## 0.18.0

- ATS map parity:
  - generated ATS facilities (277 fuel, 931 parking, 487 repair) from its zoom-8 PMTiles
  - generated 405 ATS landmark/viewpoint POIs
  - map starts at the ATS map centre instead of Europe
  - `?game=ats` query is served correctly by the local map service
- ATS fuel, rest, damage and landmark alerts now use the same plugin code paths as ETS2.

## 0.17.2

- Added the missing prebuilt WebUI map panel to `dist/webui.js`, so “地图与路网” loads instead of
  reporting that the panel artifact is missing. The panel shows map/road switches, service status
  and installed data, and links to the map page.

## 0.17.1

- Removed the unbuilt “地图与路网” WebUI panel. Coopanion panels are resolved from the prebuilt
  `dist/webui.js` bundle; adding a declaration alone caused “panel not found”. The map link and
  config switches remain.

## 0.17.0

- Added plugin-side map integration:
  - map WebUI link
  - optional map UI/visual toggles
  - plugin starts/stops its own TruckNav service when needed
  - route data toggle that disables local routing, off-route handling and fuel/rest/damage
    distance alerts when the map is off
  - map/road-network status panel
- Added `services` to the packaged files. Map data packs are still optional and not bundled.

## 0.16.1

- Landmark announcements now repeat on each pass: announce when entering the 500 m radius, reset
  after leaving the 700 m radius. The 10 s cooldown prevents rapid repeats.

## 0.16.0

- Added landmark/viewpoint proximity announcements. Within 500 m of a POI, Coo receives one event
  with the landmark name, type and distance; each landmark is announced once with a 10 s cooldown.

## 0.15.3

- Reverted the map facility layer to the raw PMTiles `spritelocations` geometry. The generated
  facility coordinates were offset from the game map, so the deduplicated layer looked misplaced.
- The 100 m deduplicated facility dataset is still used for fuel/parking/repair alerts.

## 0.15.2

- The map now renders the deduplicated local facility dataset instead of the raw PMTiles
  `spritelocations` facility points, so the 200 m clustering is visible on the page.

## 0.15.1

- Increased facility clustering from 100 m to 200 m.
  ETS2 points: fuel 468 → 432, parking 1119 → 1047, repair 547 → 498.

## 0.15.0

- Facility points are clustered within 100 m per type:
  ETS2 fuel 577 → 468, parking 1310 → 1119, repair 602 → 547.
- Added one-shot truck-damage alerts above 40%, with the next repair station along the route.
- Added `damageAlertRatio` setting.

## 0.14.0

- Extracted fuel and parking facility coordinates from the map POI layer.
- Added one-shot low-fuel alerts at 30% with the next fuel station along the current route.
- Added one-shot rest alerts at 120 game minutes, using the next parking/rest-area candidate.
- Added `fuelAlertRatio` and `restAlertMinutes` settings and a “next rest” dashboard row.
- Fuel and parking points are now color-coded on the map.

## 0.13.1

- Clear the published job route when no job is active. The browser now removes the previous route
  on `/job-route` 204 instead of leaving a stale line on the map.

## 0.13.0

- TruckNav map additions:
  - trip dashboard from live telemetry
  - facilities, landmarks/viewpoints, ferries/trains, companies and radar point layers
  - city, country/border and village layer toggles
  - truck-to-route deviation line
  - current-session trail with clear button
  - clickable POI popups
- Added a local radar GeoJSON endpoint and richer telemetry fields for the dashboard.

## 0.12.2

- Removed N5, the “local route ready” announcement (`ets2.nav-route`). The route is still loaded
  and shown on the TruckNav map; only the voice event is gone.

## 0.12.1

- Removed turn-by-turn navigation announcements (N7): no more `ets2.nav-instruction`, maneuver
  generation, turn-side lookup, or turn prompt/config. The local TruckNav map, route service,
  route snapshot, live vehicle marker and the existing distance/ETA announcements remain.

## 0.12.0

- Added an offline full-map turn-side pass for ramp/keep edges:
  `tools/build-turn-sides.mjs` reads graph + geometry and writes
  `data/trucknav/<game>/roadnetwork/turn_sides.json`.
- Each directed incoming/outgoing edge pair is classified as left/right/straight from its approach
  bearings; no image recognition and no changes to the source graph.
- The route service uses the side for type-5 ramps and says “靠左进入匝道” / “靠右进入匝道”; if the
  angle is inconclusive it says only “进入匝道”.

## 0.11.5

- Fixed duplicate turn announcements after an off-route replan by deduplicating maneuvers on a
  stable type + 50 m position key instead of clearing the announced set on every route load.
- Turn announcements are earlier by default: `navInstructionDistanceM` is now 700 m and
  `navSpeechDelayS` is now 8 s, so Coo's actual speech latency is covered.
- Maneuvers now include their game coordinates for stable deduplication.

## 0.11.4

- Reverted the extra prompt restriction on turn instructions. Coo may briefly supplement from the
  preceding navigation context, or say nothing extra.

## 0.11.3

- Graph maneuver type 5 is now announced as a neutral “进入匝道，靠右” instead of “驶出高速”.
  The map tag represents a highway ramp/link and may be an interchange to another motorway, not an exit.
- Coo is explicitly forbidden from adding invented lane/indicator/merge instructions (“打灯/并线/第几车道”).

## 0.11.2

- Fixed a paused/not-loaded telemetry off-route loop: off-route and voice navigation are skipped
  while paused or when the position is invalid `(0, 0)`.
- Added replan backoff and a circuit breaker:
  - first off-route replan: 30 s cooldown
  - second consecutive failure: stop replanning until the truck moves 500 m or the job changes
  - a new job resets the replan budget

## 0.11.1

- Turn instructions now use the highest event priority, `interrupt`, instead of only escalating to
  `preempt` at 100 m. Navigation can interrupt an in-flight Coo reply or tool call.

## 0.11.0

- Added one-shot turn-by-turn voice instructions from graph maneuver metadata:
  left/right, keep left/right, roundabout exits and highway exits.
- Each maneuver is announced once. The trigger includes the current speed and `navSpeechDelayS`
  real-time delay converted with `local.scale`; the spoken distance is the predicted distance at
  speech time.
- New setting: `navInstructionDistanceM` (default 500 m).
- No repeated 500/200/50 m announcements for the same turn.

## 0.10.2

- Load/publish the active job route even when the game is paused, so a paused game no longer leaves
  the browser preview page empty after a service or plugin restart.

## 0.10.1

- Republish the active job-route snapshot to the local preview service every ~5 seconds, even while
  paused, so a service restart or a newly opened browser page can recover the current route.

## 0.10.0

- Local preview now has a real-time vehicle marker and camera follow:
  `POST/GET /telemetry`, 5 Hz browser updates, follow toggle, heading-up toggle and recenter.
- The World publishes current position/heading/speed to the local service every ~200 ms.
- Automatic job-route preview remains: the World pushes the completed local route after pickup and
  the browser polls `/job-route`; no manual coordinates are required.
- This is a 2D map follower, not lane-level navigation.

## 0.9.0

- Telemetry now keeps source/destination city IDs and company IDs.
- Added `assets/company_sites.json` / `assets/company_sites_ats.json` generated from TruckNav company POIs:
  1844 ETS2 sites and 2186 ATS sites.
- Local route destination now resolves company site coordinates first, then falls back to the city
  centre.
- Added company-site self-learning: pickup records the source company position; delivery records the
  destination company position. Learned sites are stored per game in
  `<dataDir>/ets2-company-sites.json` / `ats-company-sites.json`, clustered within 150 m and preferred
  on later jobs.
- New setting: `companyLearningEnabled`.

## 0.8.0

- Local-only prototype of the standalone TruckNav route service
  (`D:\ATSETS\services\trucknav`), using downloaded `graph.bin` / `geometry.bin`.
- The World now requests a route from the current truck position to the active job's destination
  city centre, follows the returned full road geometry, and emits a local-route/off-route event.
- Route failure falls back to the existing phase-one game-navigation announcements.
- New settings: `navServiceEnabled`, `navServiceUrl`, `navOffRouteM`.
- No turn-by-turn instructions yet; no npm/market publish for this local prototype.

## 0.7.9

- Fixed false refuel announcements when switching trucks: the first fuel frame of a different truck
  is only used as a baseline.
- Ignore refuel pulses with a zero/negative amount, and suppress the first refuel pulse after a
  pause/reconnect. Real refuels on the same truck still announce normally.

## 0.7.8

- Updated the navigation config label/description to remove the obsolete “阶段一不做转弯指令”
  wording.

## 0.7.7

- Kept the final 200/100/50/10 km milestones.
- Added a progress announcement every `navProgressEveryKm` travelled kilometres (default 200): current
  fuel, remaining distance and a short praise from Coo.
- Progress is based on `plannedDistanceKm - current navDistance`, with the same speech-delay
  correction for the remaining-distance text.

## 0.7.6

- Speech-delay distance correction now treats `navSpeechDelayS` as real seconds and converts using
  telemetry `local.scale` (game seconds per real second). Fallback is 15× when scale is unavailable.
  At 90 km/h, a 5-real-second delay now corrects ~1.9 km instead of ~0.1 km.

## 0.7.5

- Navigation milestones reduced to 200 / 100 / 50 / 10 km.
- Milestone distances are corrected by current speed and an estimated speech delay
  (`navSpeechDelayS`, default 5 seconds), so Coo's delayed line matches the road position better.
- Zero-distance guard from 0.7.3 remains.

## 0.7.4

- Vehicle-start event now includes the absolute in-game clock (`HH:MM`, game time modulo 24h) and
  omits the location entirely when no city geofence is known.
- Coo's vehicle-start prompt now uses the included time/location when present and improvises without
  inventing missing details.

## 0.7.3

- Fixed navigation milestones firing at 0 km while a job is accepted but the trailer is not hooked
  up yet. A zero navigation distance is now treated as “route not initialized”, not as arrival.
- Milestones only start after the game reports a positive navigation distance.

## 0.7.2

- Vehicle welcome is now per truck per game session: the first engine start of each truck announces;
  stopping and restarting the same truck does not. Switching trucks and starting the new one announces
  again.
- Removed the fixed “和您一路同行” prompt. The event now includes the truck brand and current city
  (country/state when known), and Coo improvises a short opening in her own voice.

## 0.7.1

- Vehicle welcome is now once per game session when the engine starts, not once per truck forever.
- A real telemetry disconnect (game closed or returned to menu) resets the welcome for the next
  session; stopping/starting the engine inside one session does not repeat it.
- Removed the persistent `*-vehicles.json` first-drive cache.

## 0.7.0

- Phase-one navigation: while a job is active, reads the game's navigation distance/time and
  announces route start, remaining-distance milestones, ETA and arrival. No turn-by-turn or
  off-route detection yet.
- First-drive truck welcome: reads telemetry brand/model/truck id, maps common brands to Chinese,
  and asks Coo to say “（品牌）和您一路同行，让我们一起出发吧”. Seen trucks are remembered per game in
  `<dataDir>/ets2-vehicles.json` / `ats-vehicles.json`.
- New settings: `navAnnounceEnabled`, `vehicleWelcomeEnabled`.

## 0.6.1

- Local Chinese-name overlay: `assets/zh_names.json` maps 557 city tokens and 166 country/state names.
- City entry, current-city status and country/state entry events now use Chinese display names when a
  mapping exists; untranslated places fall back to the original map name.
- This is local-only for testing; not published to npm or the marketplace yet.

## 0.6.0

- Added ATS support, selected automatically from the telemetry `game` field (ETS2 = 1, ATS = 2).
- ATS data: 270 cities, 229 state border points, 541 radar/POI points.
- Separate user files per game: `ets2-cities.json` / `ats-cities.json`, `ets2-radar-points.json` / `ats-radar-points.json`.
- ATS state crossing uses `ets2.state-entered`; ETS2 retains `ets2.country-entered`.
- Installer accepts either `eurotrucks2.exe` or `amtrucks.exe`.
- Same-name cities in different states are kept distinct by map token.

## 0.5.1

- Fixed reversed country direction. Map node rotation points opposite to the side that
  `ForwardCountry` represents at the tested crossings; the entered country is now the country on the
  other side of the normal. Added regression tests using the real Sweden→Denmark and
  Luxembourg→France border points.

## 0.5.0

- Added **country border crossings** extracted from map `Node.IsCountryBorder` nodes. The truck's
  previous/current positions and the border plane determine which country was entered.
- Events: `ets2.country-entered`, with first/repeat markers and a short country introduction.
- Settings: `countryAnnounceEnabled` (default true) and `countryRepeatIntro` (default false).
- Border data: `assets/borders.json` (184 road border points, 48 country records), generated by
  `tools/BorderProbe`.
- Ferries, map loads and other teleport-sized position jumps are ignored.

## 0.4.4

- Adjusted the city-introduction prompt: a short intro may mention country or population when Coo is
  confident, but should stay to one or two sentences and must not invent landmarks or history.

## 0.4.3

- City entry now asks Coo for a short city introduction on first arrival, without reading out
  population or other data.
- Added `cityRepeatIntro` (default false): when off, re-entering the same city only reports the
  arrival; when on, Coo may introduce it again. “First” is per Coopanion run.

## 0.4.2

- Fixed city detection swallowing the first entry after starting outside a city. The baseline is now
  initialized on the first connected tick even when no city is nearby; only starting inside a city
  is silent.
- Added city-entry instructions to the environment prompt and listed `city` in the
  `ets2_recent_events` description.

## 0.4.1

- The **城市记录** panel now returns the full city list (up to 1000 entries) instead of only the
  nearest 50, so all 380 packaged cities are visible in the UI.

## 0.4.0

- Preloaded **380 official ETS2 cities** extracted from the map `CityArea` items in
  `base_map.scs` and the official map DLCs.
- City geofences now work out of the box; `assets/cities.json` is shipped with the package.
- User records in `ets2-cities.json` override the packaged map city of the same name; map cities
  cannot be deleted from the panel.
- Added `tools/CityProbe` to regenerate the city database.

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
