# Webhook Server

A Node.js Express server that receives webhook payloads and provides a public tunnel endpoint using LocalTunnel.

## Features

- **Webhook Receiver**: Accepts POST requests at `/webhook` and logs payload details
- **Health Check**: GET endpoint at `/health` for service monitoring
- **Public Tunnel**: Automatic LocalTunnel setup with reconnection logic and backoff retry
- **Graceful Shutdown**: Handles SIGINT/SIGTERM signals properly

## Installation

```bash
npm install
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### POST /webhook
Receives webhook payloads and logs them to the console.

**Request Body**: JSON payload
**Response**: 
```json
{
  "message": "Webhook received"
}
```

### GET /health
Health check endpoint for monitoring.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Configuration

The server uses the following environment variables:

- `PORT`: Server port (default: 8080)
- Tunnel subdomain is hardcoded as 'respondio' in app.js:57

## Dependencies

- **express**: Web framework
- **body-parser**: Request body parsing middleware
- **localtunnel**: Public tunneling service
- **axios**: HTTP client (installed but not currently used)

## Development Dependencies

- **nodemon**: Auto-restart server during development

## Tunnel Features

- Automatic reconnection with exponential backoff (1s to 30s)
- Connection stability detection (5-second reset period)
- Graceful tunnel cleanup on shutdown
- Error handling and logging

## Example Usage

Start the server:
```bash
npm start
```

The server will output:
```
Server running on port 8080
Creating tunnel, please wait... (attempt 1)
Webhook Route: [POST] https://respondio.loca.lt/webhook
```

Send a test webhook:
```bash
curl -X POST https://respondio.loca.lt/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "data": {"message": "hello"}}'
```

Server logs:
```
Received webhook at 2024-01-01T12:00:00.000Z
Payload: {
  "event": "test",
  "data": {
    "message": "hello"
  }
}
```