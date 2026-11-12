const fs = require("fs");
const path = require("path");
const { createServer } = require("./lib/app");
const { createFileChatStore } = require("./lib/chat");
const {
  fetchOccupancyRecords,
  fetchCoolingCentres,
} = require("./lib/toronto-open-data");

const DATA_DIR = path.join(__dirname, "data");
const HTTP_PORT = process.env.PORT || 8080;

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}

// Approved profiles are optional; a missing or malformed file disables them.
function loadShelterProfiles() {
  try {
    const filePath = path.join(DATA_DIR, "shelter-profiles.json");
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("Failed to load shelter profiles:", err);
    return {};
  }
}

const { app, httpServer } = createServer({
  fetchOccupancyRecords,
  fetchCoolingCentres,
  torontoFsa: readJson("toronto-fsa.json"),
  shelterCoords: readJson("shelter-coords.json"),
  shelterProfiles: loadShelterProfiles(),
  chatStore: createFileChatStore(path.join(DATA_DIR, "chat-messages.json")),
  clientDist: path.join(__dirname, "client", "dist"),
});

if (require.main === module) {
  httpServer.listen(HTTP_PORT, () => {
    console.log(`Server listening on port ${HTTP_PORT}`);
  });
}

// Vercel's api/*.js functions import this Express app directly (no Socket.IO).
module.exports = app;
