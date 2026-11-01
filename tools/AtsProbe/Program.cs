using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.Json;
using TruckLib.HashFs;
using TruckLib.ScsMap;
using TruckLib.Sii;

var game = Environment.GetEnvironmentVariable("ATS_DIR")
    ?? @"D:\SteamLibrary\steamapps\common\American Truck Simulator";
var package = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
var assets = Path.Combine(package, "assets");
Directory.CreateDirectory(assets);

var archives = new[]
{
    "base_map.scs", "dlc_ar.scs", "dlc_arizona.scs", "dlc_co.scs", "dlc_id.scs", "dlc_il.scs",
    "dlc_ks.scs", "dlc_la.scs", "dlc_mt.scs", "dlc_ne.scs", "dlc_nevada.scs", "dlc_nm.scs",
    "dlc_ok.scs", "dlc_or.scs", "dlc_tx.scs", "dlc_ut.scs", "dlc_wa.scs", "dlc_wy.scs",
};

var cityNames = new Dictionary<string, (string Name, string Country)>(StringComparer.OrdinalIgnoreCase);
var countries = new Dictionary<int, (string Name, string Code, string Iso)>();
foreach (var arch in new[] { "def.scs" }.Concat(archives))
{
    var path = Path.Combine(game, arch);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        LoadCityNames(fs);
        LoadCountries(fs);
    }
    catch (Exception ex) { Console.WriteLine($"{arch}: names err {ex.Message}"); }
}
// ATS state IDs used by the installed map DLCs. Some builds keep the
// country_data units outside def.scs, so fill the known IDs as a fallback.
var atsStates = new (int Id, string Name, string Code, string Iso)[]
{
    (1,"California","CA","usa-ca"),(2,"Nevada","NV","usa-nv"),(3,"Arizona","AZ","usa-az"),
    (7,"Colorado","CO","usa-co"),(13,"Idaho","ID","usa-id"),(14,"Illinois","IL","usa-il"),
    (17,"Kansas","KS","usa-ks"),(18,"Nebraska","NE","usa-ne"),(19,"Arkansas","AR","usa-ar"),
    (21,"Iowa","IA","usa-ia"),(22,"Louisiana","LA","usa-la"),(26,"Missouri","MO","usa-mo"),
    (27,"Montana","MT","usa-mt"),(31,"New Mexico","NM","usa-nm"),(36,"Oklahoma","OK","usa-ok"),
    (37,"Oregon","OR","usa-or"),(41,"South Dakota","SD","usa-sd"),(43,"Texas","TX","usa-tx"),
    (44,"Utah","UT","usa-ut"),(47,"Washington","WA","usa-wa"),(50,"Wyoming","WY","usa-wy"),
    (251,"Brackenreach","??","xx"),
};
foreach (var s in atsStates) countries.TryAdd(s.Id, (s.Name, s.Code, s.Iso));

Console.WriteLine($"ATS names: cities={cityNames.Count} states={countries.Count}");

var cityMap = new Dictionary<string, CityRow>(StringComparer.OrdinalIgnoreCase);
var borders = new List<BorderRow>();
var pois = new List<PoiRow>();
var seenBorders = new List<(int A, int B, float X, float Z)>();
var seenPois = new List<(string Type, float X, float Z)>();

foreach (var arch in archives)
{
    var path = Path.Combine(game, arch);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        var mapPath = fs.FileExists("map/usa.mbd") ? "map/usa.mbd" : "map/usa";
        var map = Map.Open(mapPath, fs);

        foreach (var ca in map.MapItems.Values.OfType<CityArea>())
        {
            var token = Normalize(ca.Name.ToString());
            if (token.Length == 0 || ca.Width <= 0 || ca.Height <= 0) continue;
            var info = cityNames.TryGetValue(token, out var n) ? n : (Pretty(token), "");
            var row = new CityRow(
                token, info.Item1, info.Item2,
                Math.Round(ca.Node.Position.X, 3), Math.Round(ca.Node.Position.Z, 3),
                Math.Round(Math.Clamp(Math.Max(ca.Width, ca.Height) / 2f, 500f, 4000f), 1),
                Math.Round(ca.Width, 1), Math.Round(ca.Height, 1), arch);
            if (!cityMap.TryGetValue(token, out var old) || row.WidthM * row.HeightM > old.WidthM * old.HeightM)
                cityMap[token] = row;
        }

        foreach (var node in map.Nodes.Values.Where(n => n.IsCountryBorder))
        {
            var a = node.ForwardCountry;
            var b = node.BackwardCountry;
            if (a == 0 || b == 0 || a == b) continue;
            var p = node.Position;
            var f = Vector3.Transform(Vector3.UnitZ, node.Rotation);
            var len = MathF.Sqrt(f.X * f.X + f.Z * f.Z);
            if (len < 0.01f) continue;
            var lo = Math.Min(a, b);
            var hi = Math.Max(a, b);
            if (seenBorders.Any(s => s.A == lo && s.B == hi &&
                MathF.Sqrt((s.X - p.X) * (s.X - p.X) + (s.Z - p.Z) * (s.Z - p.Z)) < 120f)) continue;
            seenBorders.Add((lo, hi, p.X, p.Z));
            borders.Add(new BorderRow(
                $"ats_border_{borders.Count + 1}", Math.Round(p.X, 3), Math.Round(p.Z, 3),
                Math.Round(f.X / len, 5), Math.Round(f.Z / len, 5), a, b,
                CountryName(a), CountryName(b), arch));
        }

        foreach (var tr in map.MapItems.Values.OfType<Trigger>())
        {
            var names = tr.Actions.Select(x => x.Name.ToString()).ToList();
            string? type = names.Any(x => x.Contains("offence", StringComparison.OrdinalIgnoreCase)) ? "speed_camera"
                : names.Any(x => x.Contains("weigh", StringComparison.OrdinalIgnoreCase)) ? "weigh"
                : names.Any(x => x.Contains("toll", StringComparison.OrdinalIgnoreCase)) ? "toll" : null;
            if (type is null || tr.Nodes.Count == 0) continue;
            var p = Center(tr);
            if (!float.IsFinite(p.X) || !float.IsFinite(p.Z)) continue;
            if (seenPois.Any(s => s.Type == type &&
                MathF.Sqrt((s.X - p.X) * (s.X - p.X) + (s.Z - p.Z) * (s.Z - p.Z)) < 80f)) continue;
            seenPois.Add((type, p.X, p.Z));
            var label = type == "speed_camera" ? "测速/违章摄像头" : type == "weigh" ? "称重点" : "收费站";
            var radius = type == "speed_camera" ? 600 : 500;
            var action = names.FirstOrDefault(x => x.Contains(type == "speed_camera" ? "offence" : type, StringComparison.OrdinalIgnoreCase)) ?? type;
            pois.Add(new PoiRow(
                $"ats_{type}_{pois.Count + 1}", type, $"地图{label} {pois.Count + 1}",
                Math.Round(p.X, 3), Math.Round(p.Z, 3), radius, 0, $"{arch} / {action}"));
        }

        Console.WriteLine($"{arch}: cities={cityMap.Count} borders={borders.Count} pois={pois.Count}");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{arch}: map err {ex.Message}");
    }
}

var cities = cityMap.Values.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList();
WriteJson(Path.Combine(assets, "cities_ats.json"), new
{
    version = 1,
    source = "ATS map CityArea (base_map.scs + state DLC)",
    generated_at = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
    cities,
});
WriteJson(Path.Combine(assets, "borders_ats.json"), new
{
    version = 1,
    source = "ATS state border nodes (Node.IsCountryBorder)",
    generated_at = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
    countries = countries.OrderBy(c => c.Key).Select(c => new { id = c.Key, name = c.Value.Name, code = c.Value.Code, iso = c.Value.Iso }),
    borders = borders.OrderBy(b => b.Id, StringComparer.OrdinalIgnoreCase),
});
WriteJson(Path.Combine(assets, "radar_points_ats.json"), new
{
    version = 1,
    source = "ATS map triggers (offence/weigh/toll)",
    generated_at = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
    points = pois.OrderBy(p => p.Id, StringComparer.OrdinalIgnoreCase),
});

Console.WriteLine($"wrote cities={cities.Count} borders={borders.Count} pois={pois.Count} -> {assets}");
return 0;

void LoadCityNames(IHashFsReader fs)
{
    var files = new List<string>();
    try { files.AddRange(fs.GetFiles("def/city").Where(f => f.EndsWith(".sui", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".sii", StringComparison.OrdinalIgnoreCase))); } catch { }
    if (fs.FileExists("def/city.sii")) files.Add("def/city.sii");
    foreach (var p in files.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!fs.FileExists(p)) continue;
        try
        {
            var text = fs.ReadAllText(p);
            if (!text.TrimStart().StartsWith("SiiNunit", StringComparison.OrdinalIgnoreCase)) text = "SiiNunit\n{\n" + text + "\n}";
            var sii = SiiFile.Load(text, "def", fs, true);
            foreach (var u in sii.Units.Where(u => u.Class.Equals("city_data", StringComparison.OrdinalIgnoreCase)))
            {
                var token = Normalize(u.Name);
                var name = u.Attributes.TryGetValue("city_name", out var n) ? Convert.ToString(n, CultureInfo.InvariantCulture)?.Trim() : null;
                var country = u.Attributes.TryGetValue("country", out var c) ? Convert.ToString(c, CultureInfo.InvariantCulture)?.Trim() : null;
                if (!string.IsNullOrWhiteSpace(token)) cityNames[token] = (string.IsNullOrWhiteSpace(name) ? Pretty(token) : name!, country ?? "");
            }
        }
        catch { }
    }
}

void LoadCountries(IHashFsReader fs)
{
    var files = new List<string>();
    try { files.AddRange(fs.GetFiles("def/country").Where(f => f.EndsWith(".sui", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".sii", StringComparison.OrdinalIgnoreCase))); } catch { }
    if (fs.FileExists("def/country.sii")) files.Add("def/country.sii");
    foreach (var p in files.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!fs.FileExists(p)) continue;
        try
        {
            var text = fs.ReadAllText(p);
            if (!text.TrimStart().StartsWith("SiiNunit", StringComparison.OrdinalIgnoreCase)) text = "SiiNunit\n{\n" + text + "\n}";
            var sii = SiiFile.Load(text, "def", fs, true);
            foreach (var u in sii.Units.Where(u => u.Class.Equals("country_data", StringComparison.OrdinalIgnoreCase)))
            {
                if (!u.Attributes.TryGetValue("country_id", out var raw)) continue;
                var id = Convert.ToInt32(raw, CultureInfo.InvariantCulture);
                var name = u.Attributes.TryGetValue("name", out var n) ? Convert.ToString(n, CultureInfo.InvariantCulture) : null;
                var code = u.Attributes.TryGetValue("country_code", out var cc) ? Convert.ToString(cc, CultureInfo.InvariantCulture) : null;
                var iso = u.Attributes.TryGetValue("iso_country_code", out var ic) ? Convert.ToString(ic, CultureInfo.InvariantCulture) : null;
                countries[id] = (string.IsNullOrWhiteSpace(name) ? $"State {id}" : name!, code ?? "", iso ?? "");
            }
        }
        catch { }
    }
}

void WriteJson(string path, object value)
{
    File.WriteAllText(path, JsonSerializer.Serialize(value, new JsonSerializerOptions
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    }), new UTF8Encoding(false));
}

string CountryName(int id) => countries.TryGetValue(id, out var c) ? c.Name : $"State {id}";
static string Normalize(string s)
{
    s = s.Trim();
    if (s.StartsWith("city.", StringComparison.OrdinalIgnoreCase)) s = s[5..];
    return s.ToLowerInvariant();
}
static string Pretty(string s) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s.Replace('_', ' '));
static Vector3 Center(Trigger t)
{
    if (t.Nodes.Count == 0) return Vector3.Zero;
    var sum = Vector3.Zero;
    foreach (var n in t.Nodes) sum += n.Position;
    return sum / t.Nodes.Count;
}

record CityRow(string Token, string Name, string Country, double X, double Z,
    [property: System.Text.Json.Serialization.JsonPropertyName("radius_m")] double RadiusM,
    [property: System.Text.Json.Serialization.JsonPropertyName("width_m")] double WidthM,
    [property: System.Text.Json.Serialization.JsonPropertyName("height_m")] double HeightM,
    string Source);
record BorderRow(string Id, double X, double Z, double Nx, double Nz, int ForwardCountry, int BackwardCountry, string ForwardName, string BackwardName, string Source);
record PoiRow(string Id, string Type, string Name, double X, double Z,
    [property: System.Text.Json.Serialization.JsonPropertyName("radius_m")] int RadiusM,
    [property: System.Text.Json.Serialization.JsonPropertyName("speed_limit_kmh")] int SpeedLimitKmh,
    string Note);
