using System.Globalization;
using System.Text;
using System.Text.Json;
using TruckLib.HashFs;
using TruckLib.ScsMap;
using TruckLib.Sii;

var game = Environment.GetEnvironmentVariable("ETS2_DIR")
    ?? @"D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2";
var package = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "cortico-world-ets2-dafeiyu"));
var assets = Path.Combine(package, "assets");
Directory.CreateDirectory(assets);

var archives = new[]
{
    "base_map.scs",
    "dlc_north.scs",
    "dlc_fr.scs",
    "dlc_it.scs",
    "dlc_balt.scs",
    "dlc_east.scs",
    "dlc_balkan_e.scs",
    "dlc_balkan_w.scs",
    "dlc_iberia.scs",
    "dlc_greece.scs",
    "dlc_polar.scs",
};

var names = new Dictionary<string, (string Name, string Country)>(StringComparer.OrdinalIgnoreCase);
foreach (var archive in new[] { "def.scs" }.Concat(archives))
{
    var path = Path.Combine(game, archive);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        LoadCityNames(fs);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"name archive {archive}: {ex.Message}");
    }
}
Console.WriteLine($"city definitions: {names.Count}");

var areas = new List<Area>();
foreach (var archive in archives)
{
    var path = Path.Combine(game, archive);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        var mapPath = fs.FileExists("map/europe.mbd") ? "map/europe.mbd" : "map/europe";
        var map = Map.Open(mapPath, fs);
        var found = map.MapItems.Values.OfType<CityArea>().ToList();
        Console.WriteLine($"{archive}: CityArea={found.Count}");
        foreach (var ca in found)
        {
            var token = Normalize(ca.Name.ToString());
            if (token.Length == 0 || ca.Width <= 0 || ca.Height <= 0) continue;
            areas.Add(new Area(token, ca.Node.Position.X, ca.Node.Position.Z, ca.Width, ca.Height, ca.ShowInUi, ca.TriggerVisit, archive));
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{archive}: ERR {ex.Message}");
    }
}

var cities = areas
    .GroupBy(a => a.Token, StringComparer.OrdinalIgnoreCase)
    .Select(g =>
    {
        // The largest rectangle is the actual city extent; the small ShowInUi
        // rectangles are often just labels/zones on the map.
        var best = g
            .OrderByDescending(a => a.Width * a.Height)
            .ThenByDescending(a => a.ShowInUi && a.TriggerVisit)
            .First();
        var display = names.TryGetValue(g.Key, out var n) ? n : (Pretty(g.Key), "");
        return new City(
            g.Key,
            display.Item1,
            display.Item2,
            Math.Round(best.X, 3),
            Math.Round(best.Z, 3),
            Math.Round(Math.Clamp(Math.Max(best.Width, best.Height) / 2f, 500f, 4000f), 1),
            Math.Round(best.Width, 1),
            Math.Round(best.Height, 1),
            best.Source);
    })
    .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
    .ToList();

var json = JsonSerializer.Serialize(new
{
    version = 1,
    source = "ETS2 map CityArea (base_map.scs + official map DLC)",
    generated_at = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
    cities,
}, new JsonSerializerOptions
{
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
});
File.WriteAllText(Path.Combine(assets, "cities.json"), json, new UTF8Encoding(false));

var tsv = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "cities.tsv"));
using (var w = new StreamWriter(tsv, false, new UTF8Encoding(false)))
{
    w.WriteLine("token\tname\tcountry\tx\tz\tradius_m\twidth_m\theight_m\tsource");
    foreach (var c in cities)
        w.WriteLine($"{c.Token}\t{c.Name}\t{c.Country}\t{c.X}\t{c.Z}\t{c.RadiusM}\t{c.WidthM}\t{c.HeightM}\t{c.Source}");
}

Console.WriteLine($"wrote {cities.Count} cities -> {Path.Combine(assets, "cities.json")}");
Console.WriteLine($"areas={areas.Count} distinct={cities.Count} tsv={tsv}");
return 0;

void LoadCityNames(IHashFsReader fs)
{
    var files = new List<string>();
    try
    {
        files.AddRange(fs.GetFiles("def/city")
            .Where(f => f.EndsWith(".sui", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".sii", StringComparison.OrdinalIgnoreCase)));
    }
    catch { }
    if (fs.FileExists("def/city.sii")) files.Add("def/city.sii");
    foreach (var path in files.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!fs.FileExists(path)) continue;
        try
        {
            var text = fs.ReadAllText(path);
            if (!text.TrimStart().StartsWith("SiiNunit", StringComparison.OrdinalIgnoreCase))
                text = "SiiNunit\n{\n" + text + "\n}";
            var sii = SiiFile.Load(text, "def", fs, true);
            foreach (var unit in sii.Units.Where(u => u.Class.Equals("city_data", StringComparison.OrdinalIgnoreCase)))
            {
                var token = Normalize(unit.Name);
                var name = unit.Attributes.TryGetValue("city_name", out var raw)
                    ? Convert.ToString(raw, CultureInfo.InvariantCulture)?.Trim()
                    : null;
                var country = unit.Attributes.TryGetValue("country", out var c)
                    ? Convert.ToString(c, CultureInfo.InvariantCulture)?.Trim()
                    : null;
                if (!string.IsNullOrWhiteSpace(token))
                    names[token] = (string.IsNullOrWhiteSpace(name) ? Pretty(token) : name!, country ?? "");
            }
        }
        catch
        {
            // A single malformed city file must not stop the extraction.
        }
    }
}

static string Normalize(string value)
{
    var s = value.Trim();
    if (s.StartsWith("city.", StringComparison.OrdinalIgnoreCase)) s = s[5..];
    return s.ToLowerInvariant();
}

static string Pretty(string token)
{
    var text = token.Replace('_', ' ').Trim();
    return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(text);
}

record Area(string Token, float X, float Z, float Width, float Height, bool ShowInUi, bool TriggerVisit, string Source);
record City(
    string Token,
    string Name,
    string Country,
    double X,
    double Z,
    [property: System.Text.Json.Serialization.JsonPropertyName("radius_m")] double RadiusM,
    [property: System.Text.Json.Serialization.JsonPropertyName("width_m")] double WidthM,
    [property: System.Text.Json.Serialization.JsonPropertyName("height_m")] double HeightM,
    string Source);
