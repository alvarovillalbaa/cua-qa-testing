# CUA Server

![OpenAI API](https://img.shields.io/badge/Powered_by-OpenAI_API-orange)

A Node.js service that interfaces with the OpenAI CUA model and exposes a Socket.IO WebSocket API used by the frontend.

## Setup

1. Copy the example environment file and add your OpenAI key:
   ```bash
   cp .env.example .env.development
   # edit .env.development
   ```
2. Install dependencies and launch the server:
   ```bash
   npm install
   npx playwright install
   npm run dev   # or npm start
   ```
   The server listens on port `8000` by default. Set `SOCKET_PORT` to change it.

### Environment Variables

- `OPENAI_API_KEY` – required for calls to the CUA model.
- `CUA_MODEL` (optional) – model used for computer use requests (default `gpt-5.4`).
- `CUA_TOOL_TYPE` (optional) – computer tool type (`computer` or `computer_use_preview`, default `computer`).
- `LOG_LEVEL` (optional) – logger verbosity (default `info`).
- `SOCKET_PORT` (optional) – WebSocket port (default `8000`).
- `CORS_ORIGIN` (optional) – allowed CORS origin for incoming connections.
