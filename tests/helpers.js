const { createServer } = require("../lib/app");

const TORONTO_FSA = {
  M5V: { lat: 43.6429, lon: -79.3957, name: "Downtown Toronto (CN Tower)" },
  M4C: { lat: 43.6953, lon: -79.3183, name: "East York (Woodbine Heights)" },
};

/** One City occupancy row: a single program at a single location on one night. */
function occupancyRecord(overrides = {}) {
  return {
    OCCUPANCY_DATE: "2026-11-10",
    LOCATION_ID: 1001,
    LOCATION_NAME: "Test Shelter",
    LOCATION_ADDRESS: "1 Test St",
    LOCATION_POSTAL_CODE: "M5V 1E3",
    PROGRAM_NAME: "Test Program",
    SECTOR: "Mixed Adult",
    OVERNIGHT_SERVICE_TYPE: "Shelter",
    CAPACITY_ACTUAL_BED: 10,
    OCCUPIED_BEDS: 8,
    CAPACITY_ACTUAL_ROOM: null,
    OCCUPIED_ROOMS: null,
    ...overrides,
  };
}

function coolingFeature(attributes = {}) {
  return {
    attributes: {
      OBJECTID: 1,
      PLACE_NAME: "Test Library",
      ADDRESS_NUMBER: "10",
      LINEAR_NAME_FULL: "Library Ave",
      POSTAL_CODE: "M4C 1A1",
      LATITUDE: 43.69,
      LONGITUDE: -79.31,
      ...attributes,
    },
  };
}

function memoryChatStore(initial = []) {
  const store = {
    saved: [],
    load: () => [...initial],
    save: (messages) => {
      store.saved.push([...messages]);
    },
  };
  return store;
}

/**
 * Starts the real Express + Socket.IO stack on an ephemeral localhost port.
 * Upstream City/GIS fetchers default to empty datasets.
 */
async function startTestServer(overrides = {}) {
  const chatStore = overrides.chatStore || memoryChatStore();
  const { httpServer, io } = createServer({
    fetchOccupancyRecords: async () => [],
    fetchCoolingCentres: async () => ({ features: [] }),
    torontoFsa: TORONTO_FSA,
    shelterCoords: {},
    shelterProfiles: {},
    ...overrides,
    chatStore,
  });

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    chatStore,
    close: () => new Promise((resolve) => io.close(() => resolve())),
  };
}

module.exports = {
  TORONTO_FSA,
  occupancyRecord,
  coolingFeature,
  memoryChatStore,
  startTestServer,
};
