const express = require('express');
const localtunnel = require('localtunnel');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json())

app.post('/webhook', (req, res) => {
  console.log(`Received webhook at ${new Date().toISOString()}`);
  if (!req.body) {
    console.log('No payload received')
  } else {
    console.log(`Payload: ${JSON.stringify(req.body, null, 2)}`);
  }
  return res.status(200).json({ message: 'Webhook received' });
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

let tunnel = null;
let shuttingDown = false;
let retryAttempt = 0;
let reconnecting = false;

const BASE_DELAY_MS = 1000;     // start at 1s
const MAX_DELAY_MS = 30000;     // cap at 30s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


function backoffDelay(attempt) {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 500);
  return exp + jitter;
}

// Reset attempts only after the tunnel stays up for a bit
function scheduleAttemptReset() {
  setTimeout(() => {
    if (!shuttingDown && tunnel) {
      retryAttempt = 0;
      console.log("Tunnel looks stable; retryAttempt reset to 0");
    }
  }, 5000).unref();
}

async function createTunnelOnce() {
  return await localtunnel({ port: PORT, subdomain: 'respondio' });
}

async function connectOrRetryLoop() {
  while (!shuttingDown) {
    retryAttempt += 1;
    console.log(`Creating tunnel, please wait... (attempt ${retryAttempt})\n\n`);

    try {
      // Close any previous tunnel first
      if (tunnel) {
        try { await tunnel.close(); } catch { }
        tunnel = null;
      }

      tunnel = await createTunnelOnce();
      console.log(`Webhook Route: [POST] ${tunnel.url}/webhook`);

      // If it stays up for 5s, consider it "successful" and reset attempts
      scheduleAttemptReset();

      tunnel.on("error", (err) => {
        const msg = err?.message || String(err);
        console.error("Tunnel error:", msg);
        if (!shuttingDown) reconnect(); // kick reconnect loop
      });

      tunnel.on("close", () => {
        if (!shuttingDown) {
          console.warn("Tunnel closed unexpectedly; reconnecting...");
          reconnect();
        }
      });

      return; // connected (for now). If it later errors/closes, handlers will trigger reconnect().
    } catch (err) {
      const msg = err?.message || String(err);
      console.error("Failed to create tunnel:", msg);

      const delay = backoffDelay(retryAttempt);
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      // continue loop; attempt counter is retained
    }
  }
}

async function reconnect() {
  if (reconnecting || shuttingDown) return;
  reconnecting = true;

  try {
    await connectOrRetryLoop();
  } finally {
    reconnecting = false;
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down...`);

  try {
    if (tunnel) await tunnel.close();
  } catch { }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// initial connect
reconnect().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
