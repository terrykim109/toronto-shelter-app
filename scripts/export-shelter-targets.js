/**
 * Exports latest Shelter / Motel-Hotel locations for offline agent enrichment.
 *
 * Run: node scripts/export-shelter-targets.js
 * Writes: data/shelter-targets.json
 */
const fs = require("fs");
const path = require("path");
const { fetchOccupancyRecords } = require("../lib/toronto-open-data");
const { SHELTER_SERVICE_TYPES } = require("../lib/occupancy");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "data", "shelter-targets.json");
const PROFILES_PATH = path.join(ROOT, "data", "shelter-profiles.json");

function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_PATH)) return {};
    return JSON.parse(fs.readFileSync(PROFILES_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

async function main() {
  const records = await fetchOccupancyRecords();
  const profiles = loadProfiles();

  const byLocation = {};
  for (const record of records) {
    if (!SHELTER_SERVICE_TYPES.has(record.OVERNIGHT_SERVICE_TYPE)) continue;
    const id = String(record.LOCATION_ID || record.LOCATION_NAME || "");
    if (!id) continue;

    const prev = byLocation[id];
    if (!prev) {
      byLocation[id] = record;
      continue;
    }
    if (
      new Date(record.OCCUPANCY_DATE) > new Date(prev.OCCUPANCY_DATE)
    ) {
      byLocation[id] = record;
    }
  }

  const targets = Object.values(byLocation)
    .map((record) => {
      const locationId = String(record.LOCATION_ID || record.LOCATION_NAME);
      return {
        locationId,
        name: record.LOCATION_NAME || null,
        address: record.LOCATION_ADDRESS || null,
        postalCode: record.LOCATION_POSTAL_CODE || null,
        sector: record.SECTOR || null,
        programName: record.PROGRAM_NAME || null,
        overnightServiceType: record.OVERNIGHT_SERVICE_TYPE || null,
        occupancyDate: record.OCCUPANCY_DATE || null,
        hasProfile: Boolean(profiles[locationId]),
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  fs.writeFileSync(OUT_PATH, JSON.stringify(targets, null, 2));

  const missing = targets.filter((t) => !t.hasProfile).length;
  console.log(
    `Wrote ${targets.length} shelter targets (${missing} without profiles) to ${OUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
