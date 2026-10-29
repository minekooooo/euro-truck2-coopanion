# CityProbe（开发工具）

用 TruckLib 读取 ETS2 的 `base_map.scs` + 官方地图 DLC，提取所有 `CityArea` 城市区域，
生成插件内置的 `assets/cities.json`。

## 输出

- `cortico-world-ets2-dafeiyu/assets/cities.json`
- `tools/CityProbe/cities.tsv`（便于人工检查）

`cities.json` 每个城市包含：

```json
{
  "token": "berlin",
  "name": "Berlin",
  "country": "germany",
  "x": 10070.25,
  "z": -9794.414,
  "radius_m": 1198.3,
  "width_m": 2016.6,
  "height_m": 2396.6,
  "source": "base_map.scs"
}
```

- 同名城市有多块 `CityArea` 时，取面积最大的一块作为城市范围
- 名称从 `def/city.sii` 和各 DLC 的 `def/city/*.sui` 解析；没有定义时回退到 token 的标题化
- 半径取 `max(width, height) / 2`，限制在 500–4000 米
- 只覆盖已安装的官方地图，不解析 ProMods 等地图 mod

## 运行

需要 .NET 10 SDK 和 NuGet 网络：

```bat
cd tools\CityProbe
dotnet run -c Release
```

默认游戏目录：

```text
D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2
```

可用环境变量覆盖：

```bat
set ETS2_DIR=D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2
dotnet run -c Release
```

当前结果：**380 个城市 / 1140 块 CityArea**。
