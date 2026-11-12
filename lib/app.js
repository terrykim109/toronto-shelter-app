const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const {
  normalizeFsa,
  selectAvailableShelters,
  buildSupportSites,
} = require("./occupancy");
const { attachChat } = require("./chat");

/**
 * Builds the Express app, its HTTP server, and the Socket.IO chat server.
 * Nothing listens until the caller calls `httpServer.listen()`.
 *
 * Upstream fetchers are injected so tests can run without the network:
 *   fetchOccupancyRecords(): Promise<OccupancyRecord[]>
 *   fetchCoolingCentres():   Promise<{ features?: { attributes }[] }>
 */
function createServer({
  fetchOccupancyRecords,
  fetchCoolingCentres,
  torontoFsa,
  shelterCoords,
  shelterProfiles,
  chatStore,
  clientDist = null,
}) {
  const app = express();
  const httpServer = http.createServer(app);
  const lookups = { torontoFsa, shelterCoords, shelterProfiles };

  const io = new Server(httpServer, {
    cors: { origin: true, methods: ["GET", "POST"] },
  });
  attachChat(io, chatStore);

  app.use(cors());
  app.use(express.json());

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

    return res.json({ fsa, lat: point.lat, lon: point.lon, name: point.name });
  });

  app.get("/api/shelters", async (_req, res) => {
    try {
      const records = await fetchOccupancyRecords();
      res.json(selectAvailableShelters(records, lookups));
    } catch (err) {
      console.error("API error:", err);
      res.status(500).json({ error: "Failed to fetch shelter data." });
    }
  });

  app.get("/api/support-sites", async (_req, res) => {
    try {
      const [records, coolingPayload] = await Promise.all([
        fetchOccupancyRecords(),
        fetchCoolingCentres(),
      ]);
      res.json(buildSupportSites(records, coolingPayload, lookups));
    } catch (err) {
      console.error("Support sites API error:", err);
      res.status(500).json({ error: "Failed to fetch support site data." });
    }
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback; API and socket paths must still 404 rather than return HTML.
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) {
        return next();
      }
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return { app, httpServer, io };
}

module.exports = { createServer };
