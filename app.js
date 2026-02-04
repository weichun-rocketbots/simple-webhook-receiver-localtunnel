const express = require('express');
const localtunnel = require('localtunnel');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// Storage configuration
const WEBHOOKS_FILE = path.join(__dirname, 'webhooks.jsonl');
const MAX_WEBHOOKS = 100; // Keep only last 100 webhooks in memory
const MAX_FILE_WEBHOOKS = 1000; // Keep more in file for persistence

// In-memory storage for webhooks
let webhooks = [];

// Load webhooks from file on startup
async function loadWebhooksFromFile() {
  try {
    const data = await fs.readFile(WEBHOOKS_FILE, 'utf8');
    const lines = data.trim().split('\n').filter(line => line.trim());

    // Parse JSONL and take only the most recent MAX_WEBHOOKS
    const parsedWebhooks = lines.map(line => JSON.parse(line)).reverse();
    webhooks = parsedWebhooks.slice(0, MAX_WEBHOOKS);

    console.log(`Loaded ${webhooks.length} webhooks from ${WEBHOOKS_FILE}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error loading webhooks from file:', error);
    }
    webhooks = [];
  }
}

// Save a webhook to the file (append)
async function saveWebhookToFile(webhook) {
  try {
    const line = JSON.stringify(webhook) + '\n';
    await fs.appendFile(WEBHOOKS_FILE, line);

    // Periodically clean up old entries to keep file size manageable
    const lines = (await fs.readFile(WEBHOOKS_FILE, 'utf8'))
      .trim().split('\n').filter(line => line.trim());

    if (lines.length > MAX_FILE_WEBHOOKS) {
      // Keep only the most recent MAX_FILE_WEBHOOKS entries
      const recentLines = lines.slice(-MAX_FILE_WEBHOOKS);
      await fs.writeFile(WEBHOOKS_FILE, recentLines.join('\n') + '\n');
    }
  } catch (error) {
    console.error('Error saving webhook to file:', error);
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Main page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/webhook', async (req, res) => {
  const timestamp = new Date().toISOString();
  const webhook = {
    id: Date.now().toString(),
    timestamp,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress
  };

  // Store webhook (keep only last MAX_WEBHOOKS in memory)
  webhooks.unshift(webhook);
  if (webhooks.length > MAX_WEBHOOKS) {
    webhooks = webhooks.slice(0, MAX_WEBHOOKS);
  }

  // Save to file for persistence (async, don't wait)
  saveWebhookToFile(webhook);

  console.log(`Received webhook at ${timestamp}`);
  console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
  if (!req.body) {
    console.log('No payload received')
  } else {
    console.log(`Payload: ${JSON.stringify(req.body, null, 2)}`);
  }
  return res.status(200).json({ message: 'Webhook received' });
})

// API endpoint to fetch webhook history
app.get('/api/webhooks', (req, res) => {
  res.json(webhooks);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  // Load existing webhooks from file on startup
  await loadWebhooksFromFile();
});

let tunnel = null;
let shuttingDown = false;
let retryAttempt = 0;
let reconnecting = false;

const BASE_DELAY_MS = 1000;     // start at 1s
const MAX_DELAY_MS = 30000;     // cap at 30s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Function to open browser
function openBrowser(url) {
  const start = (process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open');
  exec(`${start} ${url}`, (error) => {
    if (error) {
      console.log(`Could not open browser automatically. Please visit: ${url}`);
    } else {
      console.log(`Opened browser at: ${url}`);
    }
  });
}


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

      // Open browser to frontend automatically
      console.log(`Opening browser to webhook dashboard...`);
      openBrowser(tunnel.url);

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
