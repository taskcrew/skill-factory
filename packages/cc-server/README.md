# cc-server

HTTP server that runs [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) sessions inside a [Daytona](https://www.daytona.io/) sandbox. It exposes Claude Code over HTTP with full filesystem access, MCP server support, and streaming.

cc-server is not meant to run on your local machine. It runs **inside** a Daytona sandbox — your backend creates the sandbox and talks to cc-server over the sandbox's exposed port.

## Architecture

```
  Your backend                          Daytona sandbox
 ────────────                          ────────────────────────────────
 │                                     │                              │
 │  1. Create sandbox ────────────────►│  (Daytona provisions         │
 │     (Daytona SDK)                   │   container from image)      │
 │                                     │                              │
 │  2. Get sandbox URL  ◄─────────────│  cc-server starts on :3002   │
 │     + preview token                 │                              │
 │                                     │  ┌────────────────────────┐  │
 │  3. GET  /health ──────────────────►│  │ cc-server              │  │
 │     POST /query  ──────────────────►│  │  ├► Claude Code SDK    │  │
 │     POST /execute ─────────────────►│  │  ├► /workspace (fs)    │  │
 │                                     │  │  └► MCP servers        │  │
 │         ◄── SSE stream ────────────│  └────────────────────────┘  │
 │         ◄── JSON response ─────────│                              │
 │                                     │                              │
 │  4. Destroy sandbox ──────────────►│  (container torn down)       │
 │                                     │                              │
 ────────────                          ────────────────────────────────
```

**Flow:**

1. Your backend uses the Daytona SDK (or `SandboxManager`) to create a sandbox
2. The sandbox boots with cc-server already running on port 3002
3. Your backend makes HTTP requests directly to the sandbox URL — `/health`, `/query`, `/execute`
4. When done, your backend destroys the sandbox

Each sandbox is fully isolated: its own filesystem at `/workspace`, its own Claude session, its own MCP servers. Your `ANTHROPIC_API_KEY` is injected at creation time.

## API

These are the endpoints exposed by cc-server inside the sandbox. Your backend calls them directly using the sandbox URL and `x-daytona-preview-token` header.

### `GET /health`

Health check. Use this to verify the sandbox's cc-server is ready before sending prompts.

```bash
curl https://<sandbox-url>/health \
  -H "x-daytona-preview-token: <token>"
```

```json
{ "status": "ok", "timestamp": "2026-03-01T01:00:00.000Z", "uptime": 42 }
```

---

### `POST /query`

One-shot prompt. Sends a task to Claude Code, waits for completion, returns the full result as JSON. Best for short tasks where you just need the answer.

```bash
curl -X POST https://<sandbox-url>/query \
  -H "Content-Type: application/json" \
  -H "x-daytona-preview-token: <token>" \
  -d '{ "task": "What is 2+2?" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | The prompt to send to Claude |
| `model` | string | No | Model override (e.g. `claude-sonnet-4-5-20250514`) |
| `workspacePath` | string | No | Working directory (default: `/workspace`) |
| `outputSchema` | object | No | JSON schema — response will include `structuredOutput` parsed from result |
| `mcpServers` | object | No | MCP server configs keyed by name (see [MCP servers](#mcp-server-config)) |

**Response:**

```json
{
  "messages": [ ... ],
  "result": "4",
  "structuredOutput": { ... }
}
```

| Field | Description |
|-------|-------------|
| `messages` | Full array of SDK messages from the Claude session |
| `result` | Extracted text from the final success result, or `null` |
| `structuredOutput` | Only present when `outputSchema` was provided — the `result` parsed as JSON |

---

### `POST /execute`

Streaming prompt via SSE. Claude Code processes the task and streams messages back in real-time. Best for long-running agentic tasks where you want live progress.

```bash
curl -N -X POST https://<sandbox-url>/execute \
  -H "Content-Type: application/json" \
  -H "x-daytona-preview-token: <token>" \
  -d '{ "task": "Create a Python CLI that fetches weather data" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | The prompt to send to Claude |
| `model` | string | No | Model override |
| `workspacePath` | string | No | Working directory (default: `/workspace`) |
| `mcpServers` | object | No | MCP server configs |
| `maxTurns` | number | No | Max agentic turns |
| `timeout` | number | No | Timeout in ms |
| `disallowedTools` | string[] | No | Tools Claude should not use |

**SSE events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `lifecycle` | `{ type, sessionId, timestamp }` | Session started / completed / error |
| `message` | SDK message object | Claude responses, tool calls, results |
| `error` | `{ error }` | Error during execution |

**Example SSE stream:**

```
event: lifecycle
data: {"type":"session_started","sessionId":"abc","timestamp":"..."}

event: message
data: {"type":"assistant","message":{"content":[{"type":"text","text":"I'll create..."}]}}

event: message
data: {"type":"result","subtype":"success","result":"Done. Created weather_cli.py"}

event: lifecycle
data: {"type":"session_completed","sessionId":"abc","timestamp":"..."}
```

---

### Error responses

| Status | Meaning |
|--------|---------|
| `400` | Invalid request body or validation failure |
| `500` | Claude Code process crashed or internal error |

```json
{ "error": "description of what went wrong" }
```

## Streaming back to your backend

`/execute` uses SSE — your backend holds open a connection and receives events in real-time. This works well when your backend can maintain long-lived HTTP connections.

If your backend needs async/fire-and-forget execution instead (e.g. it queues a task and gets notified later), there are two approaches:

**Option A: Webhook callback** — Add a `webhookUrl` field to the request. cc-server POSTs events (or just the final result) to that URL. Your backend doesn't need to hold a connection open, but cc-server needs outbound HTTP access to your backend.

**Option B: Polling** — Your backend calls `/query` in a background job and polls for completion. Simpler but less responsive.

SSE (`/execute`) is recommended as the default. Add webhook support only if your backend architecture requires decoupled async communication.

## MCP server config

MCP servers can be attached to `/query` and `/execute` requests. They run inside the sandbox alongside Claude.

```json
{
  "task": "Use the weather tool to check NYC",
  "mcpServers": {
    "weather": {
      "type": "stdio",
      "command": "node",
      "args": ["weather-server.js"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

Supported transport types: `stdio`, `sse`, `http`.

## Sandbox setup

### What's in the image

Each sandbox is a Daytona container built from `oven/bun:1-slim`:

| Layer | Purpose |
|-------|---------|
| System packages | git, bash, curl, python3, wget, jq |
| Claude Code CLI | `bun install -g @anthropic-ai/claude-code` |
| cc-server source | Copied into `/app` |
| Non-root `claude` user | Runs cc-server (Claude Code CLI refuses bypass-permissions as root) |
| `/workspace` | Default working directory for Claude |

### Creating a sandbox

Use the `SandboxManager` class from your backend:

```ts
import { SandboxManager } from "cc-server/services/sandbox-manager";

const manager = new SandboxManager();

// Create — boots container, starts cc-server, waits for healthy
const info = await manager.createSandbox({
  cpu: 2,
  memory: 4,
  disk: 8,
  autostopMinutes: 30,
  envVars: { MY_VAR: "value" },
});

console.log(info.sandboxId);    // "8e671212-..."
console.log(info.baseUrl);      // "https://3002-8e671212-....daytonaproxy01.net"
console.log(info.previewToken); // "abc123"

// Use — call cc-server endpoints directly
const res = await fetch(`${info.baseUrl}/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-daytona-preview-token": info.previewToken,
  },
  body: JSON.stringify({ task: "What is 2+2?" }),
});
const data = await res.json();
console.log(data.result); // "4"

// Destroy
await manager.destroySandbox(info.sandboxId);
```

### Environment variables

These must be set in your backend's environment (they get forwarded into each sandbox):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Forwarded into each sandbox for Claude API access |
| `DAYTONA_API_KEY` | Yes | — | Used by SandboxManager to provision containers |
| `DAYTONA_TARGET` | No | `us` | Daytona target region |

### cc-server config inside the sandbox

These are set automatically by the image. You don't need to configure them:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Port cc-server listens on |
| `HOST` | `0.0.0.0` | Bind address |

## Project structure

```
src/
  index.ts                  Entry point — starts Bun.serve()
  app.ts                    Hono app — registers /health, /query, /execute
  config/
    index.ts                Environment variable parsing (zod)
    logger.ts               Pino logger setup
  handlers/
    query.ts                POST /query — one-shot Claude Code execution
    execute.ts              POST /execute — streaming execution via SSE
    sandbox.ts              Sandbox proxy handlers (optional, for proxy mode)
  services/
    claude-executor.ts      Streaming Claude Code executor
    sandbox-manager.ts      Daytona sandbox lifecycle (create/start/stop/destroy)
  shared/
    types.ts                Request/response type definitions
  types/
    hono-env.ts             Hono context type definitions
```
