using System.Globalization;
using System.Numerics;
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

var countries = new Dictionary<int, Country>();
foreach (var archive in new[] { "def.scs" }.Concat(archives))
{
    var path = Path.Combine(game, archive);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        LoadCountries(fs);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"country archive {archive}: {ex.Message}");
    }
}
// Fallback names for IDs that ETS2 uses but whose country_data may live in a
// DLC archive not installed here. Official ETS2 IDs from TruckLib.
var fallback = new (int Id, string Name, string Code, string Iso, string Token)[]
{
    (1,"Austria","A","aut","austria"),(2,"Belgium","B","bel","belgium"),(3,"Czechia","CZ","cze","czech"),
    (4,"France","F","fra","france"),(5,"Germany","D","deu","germany"),(6,"Italy","I","ita","italy"),
    (7,"Netherlands","NL","nld","netherlands"),(8,"Poland","PL","pol","poland"),(9,"Switzerland","CH","che","switzerland"),
    (10,"United Kingdom","GB","gbr","uk"),(11,"Slovakia","SK","svk","slovakia"),(12,"Luxembourg","L","lux","luxembourg"),
    (13,"Hungary","H","hun","hungary"),(14,"Albania","AL","alb","albania"),(15,"Andorra","AND","and","andorra"),
    (16,"Belarus","BY","blr","belarus"),(17,"Bosnia and Herzegovina","BIH","bih","bosnia"),
    (18,"Bulgaria","BG","bgr","bulgaria"),(19,"Croatia","HR","hrv","croatia"),(20,"Cyprus","CY","cyp","cyprus"),
    (21,"Denmark","DK","dnk","denmark"),(22,"Estonia","EST","est","estonia"),(23,"Finland","FIN","fin","finland"),
    (24,"Georgia","GE","geo","georgia"),(25,"Greece","GR","grc","greece"),(26,"Iceland","IS","isl","iceland"),
    (27,"Ireland","IRL","irl","ireland"),(28,"Latvia","LV","lva","latvia"),(29,"Liechtenstein","FL","lie","liechtenstein"),
    (30,"Lithuania","LT","ltu","lithuania"),(31,"Malta","M","mlt","malta"),(32,"Moldova","MD","mda","moldova"),
    (33,"Monaco","MC","mco","monaco"),(34,"Montenegro","MNE","mne","montenegro"),(35,"Norway","N","nor","norway"),
    (36,"Portugal","P","prt","portugal"),(37,"Romania","RO","rou","romania"),(38,"Russia","RUS","rus","russia"),
    (39,"San Marino","RSM","smr","san_marino"),(40,"Serbia","SRB","srb","serbia"),(41,"Slovenia","SLO","svn","slovenia"),
    (42,"Spain","E","esp","spain"),(43,"Sweden","S","swe","sweden"),(44,"Turkey","TR","tur","turkey"),
    (45,"Ukraine","UA","ukr","ukraine"),(203,"North Macedonia","MK","mkd","macedonia"),
};
foreach (var f in fallback)
    countries.TryAdd(f.Id, new Country(f.Id, f.Name, f.Code, f.Iso, f.Token));

Console.WriteLine($"countries: {countries.Count}");

var borders = new List<Border>();
var seen = new List<(int A, int B, float X, float Z)>();
foreach (var archive in archives)
{
    var path = Path.Combine(game, archive);
    if (!File.Exists(path)) continue;
    try
    {
        using var fs = HashFsReader.Open(path);
        var mapPath = fs.FileExists("map/europe.mbd") ? "map/europe.mbd" : "map/europe";
        var map = Map.Open(mapPath, fs);
        var nodes = map.Nodes.Values.Where(n => n.IsCountryBorder).ToList();
        Console.WriteLine($"{archive}: countryBorderNodes={nodes.Count}");
        foreach (var node in nodes)
        {
            var a = node.ForwardCountry;
            var b = node.BackwardCountry;
            if (a == 0 || b == 0 || a == b) continue;
            var p = node.Position;
            if (!float.IsFinite(p.X) || !float.IsFinite(p.Z)) continue;
            var f = Vector3.Transform(Vector3.UnitZ, node.Rotation);
            var len = MathF.Sqrt(f.X * f.X + f.Z * f.Z);
            if (len < 0.01f) continue; // rotation is not usable; skip this node
            var nx = f.X / len;
            var nz = f.Z / len;
            var lo = Math.Min(a, b);
            var hi = Math.Max(a, b);
            if (seen.Any(s => s.A == lo && s.B == hi &&
                              MathF.Sqrt((s.X - p.X) * (s.X - p.X) + (s.Z - p.Z) * (s.Z - p.Z)) < 120f))
                continue;
            seen.Add((lo, hi, p.X, p.Z));
            borders.Add(new Border(
                $"border_{borders.Count + 1}",
                Math.Round(p.X, 3),
                Math.Round(p.Z, 3),
                Math.Round(nx, 5),
                Math.Round(nz, 5),
                a,
                b,
                CountryName(countries, a),
                CountryName(countries, b),
                archive));
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{archive}: ERR {ex.Message}");
    }
}

var json = JsonSerializer.Serialize(new
{
    version = 1,
    source = "ETS2 country border nodes (Node.IsCountryBorder)",
    generated_at = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
    countries = countries.Values
        .OrderBy(c => c.Id)
        .Select(c => new { id = c.Id, name = c.Name, code = c.Code, iso = c.Iso, token = c.Token }),
    borders,
}, new JsonSerializerOptions
{
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
});
File.WriteAllText(Path.Combine(assets, "borders.json"), json, new UTF8Encoding(false));

var tsv = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "borders.tsv"));
using (var w = new StreamWriter(tsv, false, new UTF8Encoding(false)))
{
    w.WriteLine("id\tx\tz\tnx\tnz\tforward_id\tbackward_id\tforward_name\tbackward_name\tsource");
    foreach (var b in borders)
        w.WriteLine($"{b.Id}\t{b.X}\t{b.Z}\t{b.Nx}\t{b.Nz}\t{b.ForwardCountry}\t{b.BackwardCountry}\t{b.ForwardName}\t{b.BackwardName}\t{b.Source}");
}

Console.WriteLine($"wrote {borders.Count} borders -> {Path.Combine(assets, "borders.json")}");
Console.WriteLine($"borders={borders.Count} tsv={tsv}");
return 0;

void LoadCountries(IHashFsReader fs)
{
    var files = new List<string>();
    try
    {
        files.AddRange(fs.GetFiles("def/country")
            .Where(f => f.EndsWith(".sui", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".sii", StringComparison.OrdinalIgnoreCase)));
    }
    catch { }
    if (fs.FileExists("def/country.sii")) files.Add("def/country.sii");
    foreach (var path in files.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!fs.FileExists(path)) continue;
        try
        {
            var text = fs.ReadAllText(path);
            if (!text.TrimStart().StartsWith("SiiNunit", StringComparison.OrdinalIgnoreCase))
                text = "SiiNunit\n{\n" + text + "\n}";
            var sii = SiiFile.Load(text, "def", fs, true);
            foreach (var unit in sii.Units.Where(u => u.Class.Equals("country_data", StringComparison.OrdinalIgnoreCase)))
            {
                if (!unit.Attributes.TryGetValue("country_id", out var raw)) continue;
                var id = Convert.ToInt32(raw, CultureInfo.InvariantCulture);
                var name = unit.Attributes.TryGetValue("name", out var n)
                    ? Convert.ToString(n, CultureInfo.InvariantCulture)?.Trim()
                    : null;
                var code = unit.Attributes.TryGetValue("country_code", out var cc)
                    ? Convert.ToString(cc, CultureInfo.InvariantCulture)?.Trim()
                    : null;
                var iso = unit.Attributes.TryGetValue("iso_country_code", out var ic)
                    ? Convert.ToString(ic, CultureInfo.InvariantCulture)?.Trim()
                    : null;
                var token = unit.Name.Trim();
                if (token.StartsWith("country.data.", StringComparison.OrdinalIgnoreCase)) token = token[13..];
                countries[id] = new Country(id, string.IsNullOrWhiteSpace(name) ? $"Country {id}" : name!, code ?? "", iso ?? "", token);
            }
        }
        catch
        {
            // Ignore one malformed country file.
        }
    }
}

static string CountryName(Dictionary<int, Country> map, int id)
    => map.TryGetValue(id, out var c) ? c.Name : $"Country {id}";

record Country(int Id, string Name, string Code, string Iso, string Token);
record Border(string Id, double X, double Z, double Nx, double Nz, int ForwardCountry, int BackwardCountry, string ForwardName, string BackwardName, string Source);
