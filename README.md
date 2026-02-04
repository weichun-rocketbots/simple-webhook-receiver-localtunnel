# 🪝 Webhook Server

A Node.js Express server with a web dashboard for receiving, storing, and visualizing webhook payloads. Features automatic public tunneling via LocalTunnel and persistent webhook storage.

## ✨ Features

- **Webhook Receiver**: Accepts POST/PUT/GET/DELETE requests and captures complete request data
- **Web Dashboard**: Real-time web interface to view webhook history with expandable details
- **Persistent Storage**: Saves webhooks to JSONL file with configurable retention limits
- **Public Tunnel**: Automatic LocalTunnel setup with reconnection logic and backoff retry
- **Auto-refresh Dashboard**: 3-second auto-refresh with manual refresh option
- **Request Details**: Captures headers, body, query parameters, IP address, and timestamps
- **Graceful Shutdown**: Proper handling of SIGINT/SIGTERM signals
- **Browser Auto-open**: Automatically opens dashboard when tunnel is established

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Running the Server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The server will:
1. Start on port 8080 (or `PORT` environment variable)
2. Create a public tunnel at `https://respondio.loca.lt`
3. Auto-open the webhook dashboard in your browser
4. Display your webhook URL: `https://respondio.loca.lt/webhook`

## 📡 API Endpoints

### POST/PUT/GET/DELETE /webhook
Receives webhook payloads and stores them for viewing in the dashboard.

**Request**: Any JSON payload with headers
**Response**:
```json
{
  "message": "Webhook received"
}
```

**Captured Data**:
- Complete request headers
- Request body (JSON parsed)
- Query parameters
- Request method and URL
- Client IP address
- Timestamp

### GET /api/webhooks
Returns the list of stored webhooks (used by the dashboard).

**Response**: Array of webhook objects

### GET /health
Health check endpoint for monitoring.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /
Web dashboard for viewing webhook history in real-time.

## 🌐 Web Dashboard

The dashboard provides:
- **Real-time Updates**: Auto-refreshes every 3 seconds
- **Expandable Details**: Click any webhook to see full headers, body, and query params
- **Request Metadata**: View method, timestamp, and client IP
- **Syntax Highlighting**: Formatted JSON display for better readability
- **Responsive Design**: Works on desktop and mobile devices

## ⚙️ Configuration

### Environment Variables
- `PORT`: Server port (default: 8080)

### Storage Configuration
- **In-memory limit**: 100 most recent webhooks
- **File storage limit**: 1000 webhooks in `webhooks.jsonl`
- **File format**: JSONL (one JSON object per line)

### Tunnel Configuration
- **Subdomain**: `respondio` (hardcoded)
- **Retry logic**: Exponential backoff from 1s to 30s
- **Stability check**: 5-second reset period after successful connection

## 📦 Dependencies

### Runtime Dependencies
- **express** (v4.18.2): Web framework
- **body-parser** (v2.2.2): Request body parsing middleware
- **localtunnel** (v2.0.2): Public tunneling service
- **axios** (v1.13.4): HTTP client (available for future use)

### Development Dependencies
- **nodemon** (v3.0.1): Auto-restart server during development

## 🔧 Usage Examples

### Send a Test Webhook
```bash
curl -X POST https://respondio.loca.lt/webhook \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: test-value" \
  -d '{
    "event": "user.created",
    "data": {
      "id": 123,
      "email": "user@example.com",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }'
```

### Webhook with Query Parameters
```bash
curl -X POST "https://respondio.loca.lt/webhook?source=github&action=push" \
  -H "Content-Type: application/json" \
  -d '{"repository": "my-repo", "branch": "main"}'
```

### Different HTTP Methods
```bash
# PUT request
curl -X PUT https://respondio.loca.lt/webhook \
  -H "Content-Type: application/json" \
  -d '{"action": "update", "id": 456}'

# GET request (with query params)
curl -X GET "https://respondio.loca.lt/webhook?test=true&debug=1"

# DELETE request
curl -X DELETE https://respondio.loca.lt/webhook \
  -H "Content-Type: application/json" \
  -d '{"resource": "user", "id": 789}'
```

## 🛠️ Tunnel Features

- **Automatic Reconnection**: Exponential backoff retry (1s → 30s max)
- **Connection Monitoring**: Detects tunnel errors and unexpected closures
- **Stability Detection**: Resets retry counter after 5 seconds of stable connection
- **Graceful Cleanup**: Proper tunnel shutdown on process exit
- **Error Logging**: Detailed error messages for troubleshooting

## 📁 File Structure

```
webhook_server/
├── app.js              # Main server application
├── package.json        # Dependencies and scripts
├── README.md          # This file
├── webhooks.jsonl     # Persistent webhook storage (auto-created)
└── public/
    └── index.html     # Web dashboard
```

## 🔍 Server Logs

When a webhook is received:
```
Received webhook at 2024-01-01T12:00:00.000Z
Headers: {
  "content-type": "application/json",
  "user-agent": "curl/7.64.1",
  "host": "respondio.loca.lt"
}
Payload: {
  "event": "test",
  "data": {
    "message": "hello"
  }
}
```

## 🚨 Troubleshooting

### Tunnel Connection Issues
- The server will automatically retry with increasing delays
- Check your internet connection if tunnels fail repeatedly
- Try changing the subdomain if the default is taken

### Webhook Not Appearing
- Verify the URL includes `/webhook` path
- Check server console for error messages
- Refresh the dashboard manually

### Performance Issues
- The server keeps only 100 webhooks in memory for performance
- Older webhooks are archived to `webhooks.jsonl`
- Consider increasing memory limit for high-volume scenarios
