// Starts the app on an ephemeral port in its own process (for tests where the
// server may crash) and prints "PORT=<n>" once listening.
const { startTestServer } = require("../helpers");

startTestServer().then(({ baseUrl }) => {
  console.log(`PORT=${new URL(baseUrl).port}`);
});
