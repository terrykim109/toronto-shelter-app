const fs = require("fs");

const CHAT_LIMITS = Object.freeze({
  maxHistory: 150,
  maxMessageLength: 280,
  minNickname: 2,
  maxNickname: 20,
});

/**
 * Strips angle brackets and trims. React already escapes rendered text; this
 * keeps stored history free of markup for any other consumer of the file.
 */
function sanitizeText(value) {
  return String(value || "")
    .replace(/</g, "")
    .replace(/>/g, "")
    .trim();
}

/** Returns the sanitized nickname, or null when it is shorter than the minimum. */
function normalizeNickname(value) {
  const nickname = sanitizeText(value).slice(0, CHAT_LIMITS.maxNickname);
  if (nickname.length < CHAT_LIMITS.minNickname) return null;
  return nickname;
}

/**
 * Persists history as a JSON array. Reads and writes are synchronous and
 * whole-file; a missing or unreadable file is treated as empty history.
 */
function createFileChatStore(filePath) {
  return {
    load() {
      try {
        if (!fs.existsSync(filePath)) return [];
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error("Failed to load chat messages:", err);
        return [];
      }
    },
    save(messages) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
      } catch (err) {
        console.error("Failed to save chat messages:", err);
      }
    },
  };
}

/**
 * Socket.IO protocol (client -> server): "join" { nickname }, "message" { text }.
 * Server -> client: "history" ChatMessage[] (to the joiner), "message"
 * ChatMessage (to everyone), "presence" { online } (to everyone), and
 * "chat:error" { error } (to the sender).
 *
 * A socket may send messages only after a successful join. `online` counts
 * joined sockets, not raw connections.
 */
function attachChat(io, store) {
  let messages = store.load();

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
          error: `Nickname must be ${CHAT_LIMITS.minNickname}–${CHAT_LIMITS.maxNickname} characters.`,
        });
        return;
      }

      socket.data.nickname = nickname;
      socket.emit("history", messages);
      broadcastPresence();
    });

    socket.on("message", (payload = {}) => {
      const nickname = socket.data.nickname;
      if (!nickname) {
        socket.emit("chat:error", { error: "Join with a nickname first." });
        return;
      }

      const text = sanitizeText(payload.text).slice(
        0,
        CHAT_LIMITS.maxMessageLength
      );
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

      messages.push(message);
      if (messages.length > CHAT_LIMITS.maxHistory) {
        messages = messages.slice(-CHAT_LIMITS.maxHistory);
      }
      store.save(messages);
      io.emit("message", message);
    });

    socket.on("disconnect", () => {
      broadcastPresence();
    });
  });
}

module.exports = {
  CHAT_LIMITS,
  sanitizeText,
  normalizeNickname,
  createFileChatStore,
  attachChat,
};
