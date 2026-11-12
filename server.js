const express = require("express");
const https = require("https");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const HTTP_PORT = process.env.PORT || 8080;
const PACKAGE_ID = "21c83b32-d5a8-4106-a54f-010dbe49f6f2";
const COOLING_CENTRES_URL =
  "https://gis.toronto.ca/arcgis/rest/services/cot_geospatial10/FeatureServer/3/query?where=1%3D1&outFields=PLACE_NAME,ADDRESS_NUMBER,LINEAR_NAME_FULL,POSTAL_CODE,LATITUDE,LONGITUDE,OBJECTID&returnGeometry=false&outSR=4326&f=json&resultRecordCount=2000";

const SHELTER_SERVICE_TYPES = new Set(["Shelter", "Motel/Hotel Shelter"]);
const SUPPORT_SERVICE_TYPES = new Set([
  "Warming Centre",
  "24-Hour Respite Site",
  "24-Hour Women's Drop-in",
  "Surge site",
]);

const FSA_PATH = path.join(__dirname, "data", "toronto-fsa.json");
const SHELTER_COORDS_PATH = path.join(__dirname, "data", "shelter-coords.json");
const CHAT_PATH = path.join(__dirname, "data", "chat-messages.json");
const CLIENT_DIST = path.join(__dirname, "client", "dist");

const MAX_CHAT_MESSAGES = 150;
const MAX_MESSAGE_LENGTH = 280;
const MIN_NICKNAME = 2;
const MAX_NICKNAME = 20;

const torontoFsa = JSON.parse(fs.readFileSync(FSA_PATH, "utf8"));
const shelterCoords = JSON.parse(fs.readFileSync(SHELTER_COORDS_PATH, "utf8"));

function loadChatMessages() {
  try {
    if (!fs.existsSync(CHAT_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(CHAT_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load chat messages:", err);
    return [];
  }
}

function saveChatMessages(messages) {
  try {
    fs.writeFileSync(CHAT_PATH, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error("Failed to save chat messages:", err);
  }
}

let chatMessages = loadChatMessages();

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

function sanitizeText(value) {
  return String(value || "")
    .replace(/</g, "")
    .replace(/>/g, "")
    .trim();
}

function normalizeNickname(value) {
  const nickname = sanitizeText(value).slice(0, MAX_NICKNAME);
  if (nickname.length < MIN_NICKNAME) return null;
  return nickname;
}

function onlineCount() {
  let count = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.nickname) count += 1;
  }
  return count;
}

function broadcastPresence() {
  io.emit("presence", { online: onlineCount() });
}

io.on("connection", (socket) => {
  socket.on("join", (payload = {}) => {
    const nickname = normalizeNickname(payload.nickname);
    if (!nickname) {
      socket.emit("chat:error", {
        error: `Nickname must be ${MIN_NICKNAME}–${MAX_NICKNAME} characters.`,
      });
      return;
    }

    socket.data.nickname = nickname;
    socket.emit("history", chatMessages);
    broadcastPresence();
  });

  socket.on("message", (payload = {}) => {
    const nickname = socket.data.nickname;
    if (!nickname) {
      socket.emit("chat:error", { error: "Join with a nickname first." });
      return;
    }

    const text = sanitizeText(payload.text).slice(0, MAX_MESSAGE_LENGTH);
    if (!text) {
      socket.emit("chat:error", { error: "Message cannot be empty." });
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nickname,
      text,
      at: new Date().toISOString(),
    };

    chatMessages.push(message);
    if (chatMessages.length > MAX_CHAT_MESSAGES) {
      chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
    }
    saveChatMessages(chatMessages);
    io.emit("message", message);
  });

  socket.on("disconnect", () => {
    broadcastPresence();
  });
});

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

async function fetchShelterOccupancyRecords() {
  const pkg = await getPackage();
  const resource = pkg.resources.find((r) => r.format === "JSON");
  if (!resource) {
    throw new Error("Shelter JSON resource not found.");
  }
  return getJson(resource.url);
}

function toOvernightSupportSite(record) {
  const withCoords = attachCoords(record);
  const available = hasAvailability(record);
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
    available,
    lat: withCoords.lat,
    lon: withCoords.lon,
    fsa: withCoords.fsa || null,
    CAPACITY_ACTUAL_ROOM: record.CAPACITY_ACTUAL_ROOM,
    OCCUPIED_ROOMS: record.OCCUPIED_ROOMS,
    CAPACITY_ACTUAL_BED: record.CAPACITY_ACTUAL_BED,
    OCCUPIED_BEDS: record.OCCUPIED_BEDS,
  };
}

function toCoolingCentre(feature) {
  const a = feature.attributes || {};
  const street = [a.ADDRESS_NUMBER, a.LINEAR_NAME_FULL]
    .filter(Boolean)
    .join(" ")
    .trim();
  const lat = typeof a.LATITUDE === "number" ? a.LATITUDE : null;
  const lon = typeof a.LONGITUDE === "number" ? a.LONGITUDE : null;
  const fsa = normalizeFsa(a.POSTAL_CODE);

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
    lat,
    lon,
    fsa,
  };
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
    const records = await fetchShelterOccupancyRecords();
    const latest = latestByLocation(records);

    const available = latest
      .filter((record) =>
        SHELTER_SERVICE_TYPES.has(record.OVERNIGHT_SERVICE_TYPE)
      )
      .filter(hasAvailability)
      .map(attachCoords)
      .sort((a, b) =>
        String(a.LOCATION_NAME).localeCompare(String(b.LOCATION_NAME))
      );

    res.json(available);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to fetch shelter data." });
  }
});

app.get("/api/support-sites", async (_req, res) => {
  try {
    const [records, coolingPayload] = await Promise.all([
      fetchShelterOccupancyRecords(),
      getJson(COOLING_CENTRES_URL),
    ]);

    const overnight = latestByLocation(records)
      .filter((record) =>
        SUPPORT_SERVICE_TYPES.has(record.OVERNIGHT_SERVICE_TYPE)
      )
      .map(toOvernightSupportSite)
      .sort((a, b) => {
        const typeCmp = String(a.type).localeCompare(String(b.type));
        if (typeCmp !== 0) return typeCmp;
        return String(a.name).localeCompare(String(b.name));
      });

    const cooling = (coolingPayload.features || [])
      .map(toCoolingCentre)
      .filter((site) => site.lat != null && site.lon != null)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    res.json({ overnight, cooling });
  } catch (err) {
    console.error("Support sites API error:", err);
    res.status(500).json({ error: "Failed to fetch support site data." });
  }
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

if (require.main === module) {
  server.listen(HTTP_PORT, () => {
    console.log(`Server listening on port ${HTTP_PORT}`);
  });
}

module.exports = app;
