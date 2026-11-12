const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawn } = require("child_process");
const { io: connectClient } = require("socket.io-client");

const { CHAT_LIMITS } = require("../lib/chat");
const { memoryChatStore, startTestServer } = require("./helpers");

const EVENT_TIMEOUT_MS = 2000;

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      EVENT_TIMEOUT_MS
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connect(baseUrl) {
  const socket = connectClient(baseUrl, { transports: ["websocket"], forceNew: true });
  await nextEvent(socket, "connect");
  return socket;
}

async function join(socket, nickname) {
  const history = nextEvent(socket, "history");
  socket.emit("join", { nickname });
  return history;
}

async function withChat(options, fn) {
  const server = await startTestServer(options);
  const sockets = [];
  const open = async () => {
    const socket = await connect(server.baseUrl);
    sockets.push(socket);
    return socket;
  };
  try {
    await fn({ open, chatStore: server.chatStore });
  } finally {
    for (const socket of sockets) socket.disconnect();
    await server.close();
  }
}

function storedMessage(i) {
  return { id: `m${i}`, nickname: "old", text: `message ${i}`, at: "2026-11-01T00:00:00.000Z" };
}

test("join rejects nicknames shorter than two characters after trimming", async () => {
  await withChat({}, async ({ open }) => {
    const socket = await open();
    const error = nextEvent(socket, "chat:error");
    socket.emit("join", { nickname: "  a  " });
    assert.match((await error).error, /Nickname must be 2–20 characters/);
  });
});

test("join sends the stored history to the joining socket", async () => {
  const history = [storedMessage(1), storedMessage(2)];
  await withChat({ chatStore: memoryChatStore(history) }, async ({ open }) => {
    const socket = await open();
    assert.deepEqual(await join(socket, "Alex"), history);
  });
});

test("messages are refused until the socket has joined", async () => {
  await withChat({}, async ({ open, chatStore }) => {
    const socket = await open();
    const error = nextEvent(socket, "chat:error");
    socket.emit("message", { text: "hello" });
    assert.equal((await error).error, "Join with a nickname first.");
    assert.equal(chatStore.saved.length, 0);
  });
});

test("a message is broadcast to every connected socket with angle brackets removed", async () => {
  await withChat({}, async ({ open }) => {
    const sender = await open();
    const listener = await open();
    await join(sender, "Alex");

    const received = nextEvent(listener, "message");
    sender.emit("message", { text: "  <b>hi</b>  " });
    const message = await received;

    assert.equal(message.nickname, "Alex");
    assert.equal(message.text, "bhi/b");
    assert.ok(!Number.isNaN(Date.parse(message.at)));
  });
});

test("messages longer than the limit are truncated, and blank messages are rejected", async () => {
  await withChat({}, async ({ open }) => {
    const socket = await open();
    await join(socket, "Alex");

    const long = nextEvent(socket, "message");
    socket.emit("message", { text: "x".repeat(CHAT_LIMITS.maxMessageLength + 50) });
    assert.equal((await long).text.length, CHAT_LIMITS.maxMessageLength);

    const error = nextEvent(socket, "chat:error");
    socket.emit("message", { text: "   " });
    assert.equal((await error).error, "Message cannot be empty.");
  });
});

test("persisted history keeps only the most recent messages", async () => {
  const full = Array.from({ length: CHAT_LIMITS.maxHistory }, (_, i) => storedMessage(i));
  await withChat({ chatStore: memoryChatStore(full) }, async ({ open, chatStore }) => {
    const socket = await open();
    await join(socket, "Alex");

    const sent = nextEvent(socket, "message");
    socket.emit("message", { text: "newest" });
    await sent;

    const saved = chatStore.saved.at(-1);
    assert.equal(saved.length, CHAT_LIMITS.maxHistory);
    assert.equal(saved[0].id, "m1");
    assert.equal(saved.at(-1).text, "newest");
  });
});

test("presence counts joined sockets, not anonymous connections", async () => {
  await withChat({}, async ({ open }) => {
    const joined = await open();
    await open();

    const presence = nextEvent(joined, "presence");
    joined.emit("join", { nickname: "Alex" });
    assert.deepEqual(await presence, { online: 1 });
  });
});

test(
  "the server keeps running after join or message events with a null payload",
  {
    todo: "Known defect: `payload = {}` only defaults undefined, so `null.nickname` throws and the uncaught exception exits the process.",
  },
  async () => {
    const child = spawn(process.execPath, [path.join(__dirname, "fixtures", "start-server.js")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise((resolve, reject) => {
        child.once("exit", (code) => reject(new Error(`server exited early (${code})`)));
        child.stdout.on("data", (chunk) => {
          const match = String(chunk).match(/PORT=(\d+)/);
          if (match) resolve(match[1]);
        });
      });

      const socket = await connect(`http://127.0.0.1:${port}`);
      socket.emit("join", null);
      socket.emit("message", null);
      await new Promise((resolve) => setTimeout(resolve, 300));
      socket.disconnect();

      assert.equal(child.exitCode, null, "server process exited");
      const response = await fetch(`http://127.0.0.1:${port}/api/geocode?postal=M5V`);
      assert.equal(response.status, 200);
    } finally {
      child.kill();
    }
  }
);
