# AtsProbe（开发工具）

用 TruckLib 从 ATS 的 `map/usa.mbd` 和州 DLC 中提取：

- `CityArea` → `assets/cities_ats.json`
- `Node.IsCountryBorder` → `assets/borders_ats.json`
- `Trigger`（offence / weigh / toll）→ `assets/radar_points_ats.json`

当前输出：

- 270 个去重城市
- 229 个去重州界点
- 541 个去重电子狗/称重点
  - 15 个测速/违章
  - 41 个收费站
  - 485 个称重点

## 运行

```bat
cd D:\ATSETS\tools\AtsProbe
dotnet run -c Release
```

默认游戏目录：

```text
D:\SteamLibrary\steamapps\common\American Truck Simulator
```

可用 `ATS_DIR` 环境变量覆盖。需要 .NET 10 和 NuGet 网络。
