/**
 * Builds data/toronto-fsa.json from the GeoNames Canada postal export (CA.txt).
 *
 * Download: https://download.geonames.org/export/zip/CA.zip
 * Run: node scripts/build-toronto-fsa.js [path/to/CA.txt]
 *
 * Defaults to %TEMP%/geonames-ca/CA.txt on Windows if no path is given.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "data", "toronto-fsa.json");
const inputPath =
  process.argv[2] || path.join(os.tmpdir(), "geonames-ca", "CA.txt");

if (!fs.existsSync(inputPath)) {
  console.error(`CA.txt not found at ${inputPath}`);
  console.error(
    "Download https://download.geonames.org/export/zip/CA.zip and unzip first."
  );
  process.exit(1);
}

const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/);
const fsa = {};

for (const line of lines) {
  if (!line.startsWith("CA\tM")) continue;
  const parts = line.split("\t");
  const code = parts[1];
  const name = parts[2];
  const lat = parseFloat(parts[9]);
  const lon = parseFloat(parts[10]);
  if (!code || Number.isNaN(lat) || Number.isNaN(lon)) continue;
  fsa[code] = { lat, lon, name };
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(fsa, null, 2));
console.log(`Wrote ${OUT_PATH} (${Object.keys(fsa).length} FSAs)`);
