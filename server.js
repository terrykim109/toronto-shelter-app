const express = require("express");
const https = require("https");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const HTTP_PORT = process.env.PORT || 8080;
const PACKAGE_ID = "21c83b32-d5a8-4106-a54f-010dbe49f6f2";

const FSA_PATH = path.join(__dirname, "data", "toronto-fsa.json");
const SHELTER_COORDS_PATH = path.join(__dirname, "data", "shelter-coords.json");
const CLIENT_DIST = path.join(__dirname, "client", "dist");

const torontoFsa = JSON.parse(fs.readFileSync(FSA_PATH, "utf8"));
const shelterCoords = JSON.parse(fs.readFileSync(SHELTER_COORDS_PATH, "utf8"));

app.use(cors());
app.use(express.json());

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

function getPackage() {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=${PACKAGE_ID}`,
        (res) => {
          let chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString());
              resolve(data.result);
            } catch (err) {
              reject(err);
            }
          });
          res.on("error", reject);
        }
      )
      .on("error", reject);
  });
}

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

function hasAvailability(record) {
  const roomCap = parseInt(record.CAPACITY_ACTUAL_ROOM, 10) || 0;
  const roomOcc = parseInt(record.OCCUPIED_ROOMS, 10) || 0;
  if (roomCap > roomOcc) return true;

  const bedCap = parseInt(record.CAPACITY_ACTUAL_BED, 10) || 0;
  const bedOcc = parseInt(record.OCCUPIED_BEDS, 10) || 0;
  return bedCap > bedOcc;
}

function attachCoords(record) {
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

app.get("/api/geocode", (req, res) => {
  const fsa = normalizeFsa(req.query.postal);
  if (!fsa) {
    return res.status(400).json({
      error: "Enter a valid Toronto postal code (e.g. M5V 1E3 or M5V).",
    });
  }

  const point = torontoFsa[fsa];
  if (!point) {
    return res.status(404).json({
      error: `No local match for ${fsa}. This lookup covers Toronto FSAs only.`,
      fsa,
    });
  }

  return res.json({
    fsa,
    lat: point.lat,
    lon: point.lon,
    name: point.name,
  });
});

app.get("/api/shelters", async (_req, res) => {
  try {
    const pkg = await getPackage();
    const resource = pkg.resources.find((r) => r.format === "JSON");
    if (!resource) {
      return res.status(500).json({ error: "Shelter JSON resource not found." });
    }

    const records = await getJson(resource.url);
    const grouped = {};

    for (const record of records) {
      const name = record.LOCATION_NAME;
      if (!name) continue;
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(record);
    }

    const available = [];
    for (const shelterName of Object.keys(grouped)) {
      const entries = grouped[shelterName];
      entries.sort(
        (a, b) => new Date(b.OCCUPANCY_DATE) - new Date(a.OCCUPANCY_DATE)
      );
      const latest = entries[0];
      if (hasAvailability(latest)) {
        available.push(attachCoords(latest));
      }
    }

    available.sort((a, b) =>
      String(a.LOCATION_NAME).localeCompare(String(b.LOCATION_NAME))
    );

    res.json(available);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to fetch shelter data." });
  }
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(HTTP_PORT, () => {
  console.log(`Server listening on port ${HTTP_PORT}`);
});