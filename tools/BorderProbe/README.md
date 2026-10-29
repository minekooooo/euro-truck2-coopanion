# BorderProbe（开发工具）

用 TruckLib 扫描 ETS2 地图 sector 里的 `Node.IsCountryBorder`，提取道路上的国家边境点。

## 输出

- `cortico-world-ets2-dafeiyu/assets/borders.json`
- `tools/BorderProbe/borders.tsv`（人工检查）

每个边境点包含：

```json
{
  "id": "border_1",
  "x": 1217.824,
  "z": 17350.242,
  "nx": 0.56064,
  "nz": -0.82806,
  "forwardCountry": 1,
  "backwardCountry": 5,
  "forwardName": "Österreich",
  "backwardName": "Deutschland",
  "source": "base_map.scs"
}
```

- `nx/nz` 是节点旋转的前方向量，用于判断从道路哪一侧穿过
- 同名/同一对国家的相邻节点在 120 米内会去重
- 国家 ID 从 `def/country.sii` / `def/country/*.sui` 解析；缺失 ID 用 ETS2 官方
  `CountryId` 映射补全

当前结果：**184 个边境点 / 48 个国家记录**。

## 运行

```bat
cd tools\BorderProbe
dotnet run -c Release
```

默认游戏目录：

```text
D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2
```

可用 `ETS2_DIR` 覆盖。需要 .NET 10 和 NuGet 网络。
