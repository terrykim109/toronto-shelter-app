/**
 * Pure transforms from City of Toronto occupancy records (and Toronto GIS
 * cooling-centre features) into the shapes served by the API. No I/O here:
 * lookup tables are passed in so the rules can be tested in isolation.
 */

const SHELTER_SERVICE_TYPES = new Set(["Shelter", "Motel/Hotel Shelter"]);
const SUPPORT_SERVICE_TYPES = new Set([
  "Warming Centre",
  "24-Hour Respite Site",
  "24-Hour Women's Drop-in",
  "Surge site",
]);

/**
 * Returns the Forward Sortation Area (first three characters, e.g. "M5V") of a
 * Canadian postal code, or null when the input does not start with a
 * letter-digit-letter FSA. Case, spaces, and punctuation are ignored.
 */
function normalizeFsa(postal) {
  if (!postal) return null;
  const cleaned = String(postal)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 3) return null;
  const fsa = cleaned.slice(0, 3);
  if (!/^[A-Z]\d[A-Z]$/.test(fsa)) return null;
  return fsa;
}

/**
 * A program has availability when actual capacity exceeds occupancy for rooms,
 * or failing that for beds. The City reports room-based programs (families,
 * hotels) in the ROOM fields and bed-based programs in the BED fields; the
 * fields arrive as numbers, numeric strings, or null.
 */
function hasAvailability(record) {
  const roomCap = parseInt(record.CAPACITY_ACTUAL_ROOM, 10) || 0;
  const roomOcc = parseInt(record.OCCUPIED_ROOMS, 10) || 0;
  if (roomCap > roomOcc) return true;

  const bedCap = parseInt(record.CAPACITY_ACTUAL_BED, 10) || 0;
  const bedOcc = parseInt(record.OCCUPIED_BEDS, 10) || 0;
  return bedCap > bedOcc;
}

/**
 * Keeps exactly one record per LOCATION_ID (or LOCATION_NAME when the ID is
 * missing): the one with the most recent OCCUPANCY_DATE. Records with neither
 * key are dropped.
 */
function latestByLocation(records) {
  const grouped = {};
  for (const record of records) {
    const key = record.LOCATION_ID || record.LOCATION_NAME;
    if (!key) continue;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(record);
  }

  const latest = [];
  for (const entries of Object.values(grouped)) {
    entries.sort(
      (a, b) => new Date(b.OCCUPANCY_DATE) - new Date(a.OCCUPANCY_DATE)
    );
    latest.push(entries[0]);
  }
  return latest;
}

/**
 * Coordinates come from the precomputed per-location table first, then from
 * the centroid of the record's postal FSA. Both are neighbourhood-level
 * approximations, not geocoded street addresses.
 */
function attachCoords(record, { shelterCoords, torontoFsa }) {
  const byId = shelterCoords[String(record.LOCATION_ID)];
  if (byId) {
    return { ...record, lat: byId.lat, lon: byId.lon, fsa: byId.fsa };
  }

  const fsa = normalizeFsa(record.LOCATION_POSTAL_CODE);
  const point = fsa ? torontoFsa[fsa] : null;
  if (point) {
    return { ...record, lat: point.lat, lon: point.lon, fsa };
  }

  return { ...record, lat: null, lon: null, fsa: fsa || null };
}

/**
 * Matches an approved profile by LOCATION_ID, falling back to a
 * case-insensitive exact name match. `profile` is null when nothing matches.
 */
function attachProfile(record, shelterProfiles) {
  const byId = shelterProfiles[String(record.LOCATION_ID)];
  if (byId) return { ...record, profile: byId };

  const nameKey = String(record.LOCATION_NAME || "")
    .trim()
    .toLowerCase();
  if (nameKey) {
    for (const profile of Object.values(shelterProfiles)) {
      if (
        profile &&
        String(profile.name || "")
          .trim()
          .toLowerCase() === nameKey
      ) {
        return { ...record, profile };
      }
    }
  }

  return { ...record, profile: null };
}

function byName(field) {
  return (a, b) => String(a[field]).localeCompare(String(b[field]));
}

/** Shelter and motel/hotel locations with open capacity, sorted by name. */
function selectAvailableShelters(records, lookups) {
  return latestByLocation(records)
    .filter((record) => SHELTER_SERVICE_TYPES.has(record.OVERNIGHT_SERVICE_TYPE))
    .filter(hasAvailability)
    .map((record) => attachCoords(record, lookups))
    .map((record) => attachProfile(record, lookups.shelterProfiles))
    .sort(byName("LOCATION_NAME"));
}

function toOvernightSupportSite(record, lookups) {
  const withCoords = attachCoords(record, lookups);
  return {
    id: String(record.LOCATION_ID || record.LOCATION_NAME),
    name: record.LOCATION_NAME,
    address: record.LOCATION_ADDRESS || null,
    postalCode: record.LOCATION_POSTAL_CODE || null,
    type: record.OVERNIGHT_SERVICE_TYPE || "Overnight support",
    category: "overnight",
    sector: record.SECTOR || null,
    programName: record.PROGRAM_NAME || null,
    occupancyDate: record.OCCUPANCY_DATE || null,
    available: hasAvailability(record),
    lat: withCoords.lat,
    lon: withCoords.lon,
    fsa: withCoords.fsa || null,
    CAPACITY_ACTUAL_ROOM: record.CAPACITY_ACTUAL_ROOM,
    OCCUPIED_ROOMS: record.OCCUPIED_ROOMS,
    CAPACITY_ACTUAL_BED: record.CAPACITY_ACTUAL_BED,
    OCCUPIED_BEDS: record.OCCUPIED_BEDS,
  };
}

// Cooling centres have no occupancy feed, so they are always "available".
function toCoolingCentre(feature) {
  const a = feature.attributes || {};
  const street = [a.ADDRESS_NUMBER, a.LINEAR_NAME_FULL]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: `cooling-${a.OBJECTID}`,
    name: a.PLACE_NAME || street || "Cooling centre",
    address: street || null,
    postalCode: a.POSTAL_CODE || null,
    type: "Cooling Centre",
    category: "cooling",
    sector: null,
    programName: null,
    occupancyDate: null,
    available: true,
    lat: typeof a.LATITUDE === "number" ? a.LATITUDE : null,
    lon: typeof a.LONGITUDE === "number" ? a.LONGITUDE : null,
    fsa: normalizeFsa(a.POSTAL_CODE),
  };
}

/**
 * Overnight alternatives (full ones included, flagged `available: false`)
 * sorted by type then name, plus cooling centres that have coordinates.
 */
function buildSupportSites(records, coolingPayload, lookups) {
  const overnight = latestByLocation(records)
    .filter((record) => SUPPORT_SERVICE_TYPES.has(record.OVERNIGHT_SERVICE_TYPE))
    .map((record) => toOvernightSupportSite(record, lookups))
    .sort((a, b) => byName("type")(a, b) || byName("name")(a, b));

  const cooling = ((coolingPayload && coolingPayload.features) || [])
    .map(toCoolingCentre)
    .filter((site) => site.lat != null && site.lon != null)
    .sort(byName("name"));

  return { overnight, cooling };
}

module.exports = {
  SHELTER_SERVICE_TYPES,
  SUPPORT_SERVICE_TYPES,
  normalizeFsa,
  hasAvailability,
  latestByLocation,
  attachCoords,
  attachProfile,
  selectAvailableShelters,
  buildSupportSites,
};
