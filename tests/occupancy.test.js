const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeFsa,
  hasAvailability,
  latestByLocation,
  attachCoords,
  attachProfile,
  selectAvailableShelters,
  buildSupportSites,
} = require("../lib/occupancy");
const { TORONTO_FSA, occupancyRecord, coolingFeature } = require("./helpers");

const lookups = {
  torontoFsa: TORONTO_FSA,
  shelterCoords: {},
  shelterProfiles: {},
};

test("normalizeFsa extracts the FSA regardless of case, spacing, or punctuation", () => {
  assert.equal(normalizeFsa("m5v 1e3"), "M5V");
  assert.equal(normalizeFsa("M5V-1E3"), "M5V");
  assert.equal(normalizeFsa("M5V"), "M5V");
});

test("normalizeFsa rejects inputs that do not start with letter-digit-letter", () => {
  for (const input of [null, undefined, "", "M5", "12345", "5MV 1E3", "MM5"]) {
    assert.equal(normalizeFsa(input), null, `expected null for ${input}`);
  }
});

test("hasAvailability is true when actual bed capacity exceeds occupied beds", () => {
  assert.equal(hasAvailability(occupancyRecord({ CAPACITY_ACTUAL_BED: 10, OCCUPIED_BEDS: 9 })), true);
  assert.equal(hasAvailability(occupancyRecord({ CAPACITY_ACTUAL_BED: 10, OCCUPIED_BEDS: 10 })), false);
});

test("hasAvailability reads room-based programs from the room fields", () => {
  const roomBased = {
    CAPACITY_ACTUAL_BED: null,
    OCCUPIED_BEDS: null,
    CAPACITY_ACTUAL_ROOM: "40",
    OCCUPIED_ROOMS: "39",
  };
  assert.equal(hasAvailability(occupancyRecord(roomBased)), true);
  assert.equal(
    hasAvailability(occupancyRecord({ ...roomBased, OCCUPIED_ROOMS: "40" })),
    false
  );
});

test("hasAvailability treats missing capacity as no availability", () => {
  assert.equal(
    hasAvailability({ CAPACITY_ACTUAL_BED: null, CAPACITY_ACTUAL_ROOM: null }),
    false
  );
});

test("latestByLocation keeps the most recent night for each location", () => {
  const latest = latestByLocation([
    occupancyRecord({ LOCATION_ID: 1, OCCUPANCY_DATE: "2026-11-08", OCCUPIED_BEDS: 1 }),
    occupancyRecord({ LOCATION_ID: 1, OCCUPANCY_DATE: "2026-11-10", OCCUPIED_BEDS: 3 }),
    occupancyRecord({ LOCATION_ID: 1, OCCUPANCY_DATE: "2026-11-09", OCCUPIED_BEDS: 2 }),
    occupancyRecord({ LOCATION_ID: 2, OCCUPANCY_DATE: "2026-11-01" }),
  ]);

  assert.equal(latest.length, 2);
  const one = latest.find((r) => r.LOCATION_ID === 1);
  assert.equal(one.OCCUPANCY_DATE, "2026-11-10");
  assert.equal(one.OCCUPIED_BEDS, 3);
});

test("latestByLocation groups by name when LOCATION_ID is missing and drops unkeyed rows", () => {
  const latest = latestByLocation([
    occupancyRecord({ LOCATION_ID: null, LOCATION_NAME: "No Id Site" }),
    occupancyRecord({ LOCATION_ID: null, LOCATION_NAME: "No Id Site", OCCUPANCY_DATE: "2026-11-01" }),
    occupancyRecord({ LOCATION_ID: null, LOCATION_NAME: null }),
  ]);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].LOCATION_NAME, "No Id Site");
});

test("attachCoords prefers the per-location table over the postal-code centroid", () => {
  const withCoords = attachCoords(occupancyRecord({ LOCATION_ID: 77 }), {
    torontoFsa: TORONTO_FSA,
    shelterCoords: { 77: { lat: 1, lon: 2, fsa: "M4C" } },
  });
  assert.deepEqual([withCoords.lat, withCoords.lon, withCoords.fsa], [1, 2, "M4C"]);
});

test("attachCoords falls back to the FSA centroid, then to null coordinates", () => {
  const byFsa = attachCoords(occupancyRecord({ LOCATION_POSTAL_CODE: "m4c 2b2" }), lookups);
  assert.deepEqual(
    [byFsa.lat, byFsa.lon, byFsa.fsa],
    [TORONTO_FSA.M4C.lat, TORONTO_FSA.M4C.lon, "M4C"]
  );

  const unknown = attachCoords(occupancyRecord({ LOCATION_POSTAL_CODE: "K1A 0B1" }), lookups);
  assert.deepEqual([unknown.lat, unknown.lon, unknown.fsa], [null, null, "K1A"]);
});

test("attachProfile matches by location id, then by case-insensitive name", () => {
  const profiles = {
    1001: { locationId: "1001", name: "By Id" },
    2002: { locationId: "2002", name: "Named Shelter" },
  };

  assert.equal(attachProfile(occupancyRecord({ LOCATION_ID: 1001 }), profiles).profile.name, "By Id");
  assert.equal(
    attachProfile(occupancyRecord({ LOCATION_ID: 9, LOCATION_NAME: "  named SHELTER " }), profiles).profile.name,
    "Named Shelter"
  );
  assert.equal(attachProfile(occupancyRecord({ LOCATION_ID: 9, LOCATION_NAME: "Other" }), profiles).profile, null);
});

test("selectAvailableShelters returns only shelter-type locations with open capacity, sorted by name", () => {
  const shelters = selectAvailableShelters(
    [
      occupancyRecord({ LOCATION_ID: 1, LOCATION_NAME: "Zeta House" }),
      occupancyRecord({ LOCATION_ID: 2, LOCATION_NAME: "Alpha Hotel", OVERNIGHT_SERVICE_TYPE: "Motel/Hotel Shelter" }),
      occupancyRecord({ LOCATION_ID: 3, LOCATION_NAME: "Full Place", OCCUPIED_BEDS: 10 }),
      occupancyRecord({ LOCATION_ID: 4, LOCATION_NAME: "Warm Room", OVERNIGHT_SERVICE_TYPE: "Warming Centre" }),
    ],
    lookups
  );

  assert.deepEqual(
    shelters.map((s) => s.LOCATION_NAME),
    ["Alpha Hotel", "Zeta House"]
  );
  assert.ok(shelters.every((s) => "lat" in s && "profile" in s));
});

test("buildSupportSites keeps full overnight sites but flags them unavailable", () => {
  const { overnight } = buildSupportSites(
    [
      occupancyRecord({ LOCATION_ID: 5, LOCATION_NAME: "Full Respite", OVERNIGHT_SERVICE_TYPE: "24-Hour Respite Site", OCCUPIED_BEDS: 10 }),
      occupancyRecord({ LOCATION_ID: 6, LOCATION_NAME: "Open Warming", OVERNIGHT_SERVICE_TYPE: "Warming Centre" }),
      occupancyRecord({ LOCATION_ID: 7, LOCATION_NAME: "A Regular Shelter" }),
    ],
    { features: [] },
    lookups
  );

  assert.deepEqual(
    overnight.map((s) => [s.type, s.name, s.available]),
    [
      ["24-Hour Respite Site", "Full Respite", false],
      ["Warming Centre", "Open Warming", true],
    ]
  );
  assert.equal(overnight[0].category, "overnight");
  assert.equal(overnight[0].id, "5");
});

test("buildSupportSites omits cooling centres without coordinates", () => {
  const { cooling } = buildSupportSites(
    [],
    {
      features: [
        coolingFeature({ OBJECTID: 1, PLACE_NAME: "Mapped Library" }),
        coolingFeature({ OBJECTID: 2, PLACE_NAME: "Unmapped Pool", LATITUDE: null }),
      ],
    },
    lookups
  );

  assert.equal(cooling.length, 1);
  assert.equal(cooling[0].id, "cooling-1");
  assert.equal(cooling[0].address, "10 Library Ave");
  assert.equal(cooling[0].available, true);
});

// --- Known defects: these document intended behavior and currently fail. ---

test(
  "selectAvailableShelters lists a location when any of its shelter programs that night has space",
  {
    todo: "Known defect: latestByLocation keeps one program per location, so a full program can hide an open one at the same address.",
  },
  () => {
    const shelters = selectAvailableShelters(
      [
        occupancyRecord({ LOCATION_ID: 1, PROGRAM_NAME: "Men's", OCCUPIED_BEDS: 10 }),
        occupancyRecord({ LOCATION_ID: 1, PROGRAM_NAME: "Women's", OCCUPIED_BEDS: 2 }),
      ],
      lookups
    );
    assert.equal(shelters.length, 1);
  }
);

test(
  "occupancy views omit locations that stopped reporting before the dataset's latest night",
  {
    todo: "Known defect: a location's last record is shown as current even if it is months old.",
  },
  () => {
    const records = [
      occupancyRecord({ LOCATION_ID: 1, OCCUPANCY_DATE: "2026-11-10" }),
      occupancyRecord({ LOCATION_ID: 2, OCCUPANCY_DATE: "2026-04-11" }),
      occupancyRecord({ LOCATION_ID: 3, OCCUPANCY_DATE: "2026-04-11", OVERNIGHT_SERVICE_TYPE: "Warming Centre" }),
    ];
    assert.deepEqual(
      selectAvailableShelters(records, lookups).map((s) => s.LOCATION_ID),
      [1]
    );
    assert.equal(buildSupportSites(records, { features: [] }, lookups).overnight.length, 0);
  }
);
