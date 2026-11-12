const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const {
  TORONTO_FSA,
  occupancyRecord,
  coolingFeature,
  startTestServer,
} = require("./helpers");

async function withServer(overrides, fn) {
  const server = await startTestServer(overrides);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

async function getJson(url) {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
}

test("GET /api/geocode returns the FSA centroid for a full or partial postal code", async () => {
  await withServer({}, async (baseUrl) => {
    for (const postal of ["m5v 1e3", "M5V"]) {
      const { status, body } = await getJson(
        `${baseUrl}/api/geocode?postal=${encodeURIComponent(postal)}`
      );
      assert.equal(status, 200);
      assert.deepEqual(body, { fsa: "M5V", ...TORONTO_FSA.M5V });
    }
  });
});

test("GET /api/geocode responds 400 for a missing or malformed postal code", async () => {
  await withServer({}, async (baseUrl) => {
    for (const query of ["", "?postal=", "?postal=12345"]) {
      const { status, body } = await getJson(`${baseUrl}/api/geocode${query}`);
      assert.equal(status, 400);
      assert.match(body.error, /valid Toronto postal code/);
    }
  });
});

test("GET /api/geocode responds 404 for a well-formed FSA outside the Toronto table", async () => {
  await withServer({}, async (baseUrl) => {
    const { status, body } = await getJson(`${baseUrl}/api/geocode?postal=K1A%200B1`);
    assert.equal(status, 404);
    assert.equal(body.fsa, "K1A");
  });
});

test("GET /api/shelters returns available shelters with coordinates and approved profiles", async () => {
  const profile = { locationId: "1001", name: "Test Shelter", phone: "416-555-0100" };
  await withServer(
    {
      fetchOccupancyRecords: async () => [
        occupancyRecord({ LOCATION_ID: 1001 }),
        occupancyRecord({ LOCATION_ID: 1002, LOCATION_NAME: "Full Shelter", OCCUPIED_BEDS: 10 }),
      ],
      shelterProfiles: { 1001: profile },
    },
    async (baseUrl) => {
      const { status, body } = await getJson(`${baseUrl}/api/shelters`);
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].LOCATION_ID, 1001);
      assert.equal(body[0].lat, TORONTO_FSA.M5V.lat);
      assert.equal(body[0].fsa, "M5V");
      assert.deepEqual(body[0].profile, profile);
    }
  );
});

test("GET /api/shelters responds 500 with a generic message when the City feed fails", async (t) => {
  t.mock.method(console, "error", () => {});
  await withServer(
    {
      fetchOccupancyRecords: async () => {
        throw new Error("ECONNRESET internal detail");
      },
    },
    async (baseUrl) => {
      const { status, body } = await getJson(`${baseUrl}/api/shelters`);
      assert.equal(status, 500);
      assert.deepEqual(body, { error: "Failed to fetch shelter data." });
    }
  );
});

test("GET /api/support-sites returns overnight alternatives and mapped cooling centres", async () => {
  await withServer(
    {
      fetchOccupancyRecords: async () => [
        occupancyRecord({ LOCATION_ID: 6, LOCATION_NAME: "Warm Room", OVERNIGHT_SERVICE_TYPE: "Warming Centre" }),
      ],
      fetchCoolingCentres: async () => ({ features: [coolingFeature()] }),
    },
    async (baseUrl) => {
      const { status, body } = await getJson(`${baseUrl}/api/support-sites`);
      assert.equal(status, 200);
      assert.deepEqual(body.overnight.map((s) => s.name), ["Warm Room"]);
      assert.deepEqual(body.cooling.map((s) => s.name), ["Test Library"]);
    }
  );
});

test("GET /api/support-sites fails as a whole when either upstream source fails", async (t) => {
  t.mock.method(console, "error", () => {});
  await withServer(
    {
      fetchOccupancyRecords: async () => [],
      fetchCoolingCentres: async () => {
        throw new Error("GIS down");
      },
    },
    async (baseUrl) => {
      const { status, body } = await getJson(`${baseUrl}/api/support-sites`);
      assert.equal(status, 500);
      assert.deepEqual(body, { error: "Failed to fetch support site data." });
    }
  );
});

test("with a built client, unknown page routes serve index.html but unknown API routes 404", async () => {
  const clientDist = fs.mkdtempSync(path.join(os.tmpdir(), "client-dist-"));
  fs.writeFileSync(path.join(clientDist, "index.html"), "<!doctype html><title>app</title>");

  await withServer({ clientDist }, async (baseUrl) => {
    const page = await fetch(`${baseUrl}/some/client/route`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>app<\/title>/);

    const api = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(api.status, 404);
    assert.doesNotMatch(await api.text(), /<title>app<\/title>/);
  });
});

test("Vercel function api/geocode.js serves the geocode route whatever path it is invoked on", async () => {
  // Uses the real server wiring and committed data/toronto-fsa.json; no network.
  const handler = require("../api/geocode");
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const { status, body } = await getJson(
      `http://127.0.0.1:${port}/api/geocode.js?postal=M5V`
    );
    assert.equal(status, 200);
    assert.equal(body.fsa, "M5V");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
