/**
 * Builds data/shelter-coords.json from City of Toronto shelter occupancy data,
 * using each location's postal code FSA and our local toronto-fsa.json centroids.
 *
 * Run: node scripts/build-shelter-coords.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const PACKAGE_ID = "21c83b32-d5a8-4106-a54f-010dbe49f6f2";
const ROOT = path.join(__dirname, "..");
const FSA_PATH = path.join(ROOT, "data", "toronto-fsa.json");
const OUT_PATH = path.join(ROOT, "data", "shelter-coords.json");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

function normalizeFsa(postal) {
  if (!postal) return null;
  const cleaned = String(postal)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 3) return null;
  return cleaned.slice(0, 3);
}

async function main() {
  const fsaMap = JSON.parse(fs.readFileSync(FSA_PATH, "utf8"));

  const pkg = (await getJson(
    `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=${PACKAGE_ID}`
  )).result;
  const resourceUrl = pkg.resources.find((r) => r.format === "JSON").url;
  const records = await getJson(resourceUrl);

  const byLocation = {};
  for (const record of records) {
    const id = record.LOCATION_ID || record.LOCATION_NAME;
    if (!id) continue;
    if (!byLocation[id]) {
      byLocation[id] = record;
    } else {
      const prev = new Date(byLocation[id].OCCUPANCY_DATE);
      const next = new Date(record.OCCUPANCY_DATE);
      if (next > prev) byLocation[id] = record;
    }
  }

  const coords = {};
  let matched = 0;
  let missing = 0;

  for (const [id, record] of Object.entries(byLocation)) {
    const fsa = normalizeFsa(record.LOCATION_POSTAL_CODE);
    const point = fsa ? fsaMap[fsa] : null;

    if (point) {
      matched += 1;
      coords[id] = {
        locationId: String(id),
        locationName: record.LOCATION_NAME || null,
        address: record.LOCATION_ADDRESS || null,
        postalCode: record.LOCATION_POSTAL_CODE || null,
        fsa,
        lat: point.lat,
        lon: point.lon,
      };
    } else {
      missing += 1;
      console.warn(
        "No FSA match for",
        record.LOCATION_NAME,
        record.LOCATION_POSTAL_CODE
      );
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(coords, null, 2));
  console.log(
    `Wrote ${OUT_PATH} (${matched} matched, ${missing} missing of ${Object.keys(byLocation).length} locations)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
