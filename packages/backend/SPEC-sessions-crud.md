# Specification: Agent SDK Session CRUD API

## Context

The backend needs CRUD endpoints for managing Agent SDK sessions and their messages. This enables the frontend to create, configure, and interact with Claude Agent SDK sessions, persisting metadata and conversation history in PostgreSQL. The schema mirrors Agent SDK types where possible, using `jsonb` for flexible/nested fields.

---

## Entities

### 1. `sessions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key |
| `name` | `text` | no | — | User-given session name |
| `claude_session_id` | `text` | yes | `null` | Session ID returned by Agent SDK (`SDKSystemMessage.session_id`) |
| `status` | `text` | no | `'created'` | One of: `created`, `active`, `completed`, `error` |
| `config` | `jsonb` | no | `'{}'` | Agent SDK configuration (see [Session Config Shape](#session-config-jsonb-shape)) |
| `browser_session_id` | `text` | yes | `null` | Single browser session ID |
| `sandbox_id` | `text` | yes | `null` | Browser sandbox provider ID (e.g. from E2B or similar) |
| `sdk_init` | `jsonb` | yes | `null` | Captured from `SDKSystemMessage` init event (model, tools, mcp_servers, permissionMode, etc.) |
| `result` | `jsonb` | yes | `null` | Captured from `SDKResultMessage` (duration, cost, usage, etc.) |
| `created_at` | `timestamptz` | no | `now()` | Row creation |
| `updated_at` | `timestamptz` | no | `now()` | Last update |

#### Session Config jsonb Shape

Mirrors `Options` from the Agent SDK TypeScript reference:

```ts
{
  model?: string;                          // e.g. "claude-opus-4-6"
  permissionMode?: PermissionMode;         // "default" | "acceptEdits" | "bypassPermissions" | "plan"
  allowedTools?: string[];                 // ["Read", "Edit", "Bash", ...]
  disallowedTools?: string[];
  maxTurns?: number;
  mcpServers?: Record<string, McpServerConfig>;  // keyed by server name
  agents?: Record<string, AgentDefinition>;      // keyed by agent name
  systemPrompt?: string | { type: "preset", preset: "claude_code", append?: string };
  appendSystemPrompt?: string;
  cwd?: string;
  additionalDirectories?: string[];
  plugins?: { type: "local", path: string }[];
  settingSources?: ("user" | "project" | "local")[];
  hooks?: Record<string, unknown>;         // simplified — hook config
  maxBudgetUsd?: number;
  effort?: "low" | "medium" | "high" | "max";
}
```

#### SDK Init jsonb Shape

Captured verbatim from the `SDKSystemMessage` (`type: "system", subtype: "init"`):

```ts
{
  agents?: string[];
  apiKeySource: string;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: string;
  slash_commands: string[];
  skills: string[];
  plugins: { name: string; path: string }[];
  claude_code_version: string;
}
```

#### Result jsonb Shape

Captured from `SDKResultMessage`:

```ts
{
  subtype: "success" | "error_max_turns" | "error_during_execution" | "error_max_budget_usd";
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result?: string;              // only on success
  errors?: string[];            // only on error
  total_cost_usd: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number };
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; costUSD: number }>;
}
```

---

### 2. `session_messages`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key |
| `session_id` | `uuid` | no | — | FK → `sessions.id` (cascade delete) |
| `sdk_message_id` | `uuid` | yes | `null` | The `uuid` field from the SDK message |
| `type` | `text` | no | — | SDK message type: `user`, `assistant`, `system`, `result`, `stream_event` |
| `subtype` | `text` | yes | `null` | e.g. `init`, `success`, `error_max_turns`, `compact_boundary` |
| `parent_tool_use_id` | `text` | yes | `null` | For subagent tracking |
| `content` | `jsonb` | no | — | Full SDK message payload (the `message` field or entire object depending on type) |
| `created_at` | `timestamptz` | no | `now()` | Row creation |

**Index:** `session_messages_session_id_idx` on `(session_id, created_at)`

---

## API Endpoints

Base path: `/api/sessions`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions` | List all sessions (paginated) |
| `GET` | `/api/sessions/:id` | Get session by ID (includes messages) |
| `PATCH` | `/api/sessions/:id` | Update session (name, config, status, browser_session_id, sandbox_id, sdk_init, result, claude_session_id) |
| `DELETE` | `/api/sessions/:id` | Delete session (cascades to messages) |

Note: `session_messages` are not exposed via API. They are written internally by the backend when processing SDK message streams.

---

## Request/Response Shapes

### `POST /api/sessions`

**Request:**
```json
{
  "name": "My coding session",
  "config": { "model": "claude-opus-4-6", "allowedTools": ["Read", "Edit", "Bash"] },
  "browser_session_id": "browser-abc-123",
  "sandbox_id": "sandbox-xyz-789"
}
```

**Response:** `201`
```json
{
  "id": "uuid",
  "name": "My coding session",
  "claude_session_id": null,
  "status": "created",
  "config": { "..." : "..." },
  "browser_session_id": "browser-abc-123",
  "sandbox_id": "sandbox-xyz-789",
  "sdk_init": null,
  "result": null,
  "created_at": "2026-02-28T...",
  "updated_at": "2026-02-28T..."
}
```

### `GET /api/sessions`

**Query params:** `?limit=20&offset=0&status=active`

**Response:** `200`
```json
{
  "data": [ { "...": "session" } ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### `GET /api/sessions/:id`

**Response:** `200`
```json
{
  "id": "uuid",
  "name": "My coding session",
  "claude_session_id": "sdk-session-uuid",
  "status": "active",
  "config": { "..." : "..." },
  "browser_session_id": "browser-abc-123",
  "sandbox_id": "sandbox-xyz-789",
  "sdk_init": { "..." : "..." },
  "result": null,
  "created_at": "2026-02-28T...",
  "updated_at": "2026-02-28T...",
  "messages": [
    {
      "id": "uuid",
      "sdk_message_id": "uuid",
      "type": "user",
      "subtype": null,
      "parent_tool_use_id": null,
      "content": { "..." : "..." },
      "created_at": "2026-02-28T..."
    }
  ]
}
```

### `PATCH /api/sessions/:id`

**Request** (all fields optional):
```json
{
  "name": "Renamed session",
  "config": { "model": "claude-sonnet-4-6" },
  "status": "active",
  "claude_session_id": "sdk-session-uuid",
  "browser_session_id": "browser-abc-123",
  "sandbox_id": "sandbox-xyz-789",
  "sdk_init": { "..." : "..." },
  "result": { "..." : "..." }
}
```

**Response:** `200` — updated session object

### `DELETE /api/sessions/:id`

**Response:** `204` — no content

---

## Validation

Use **Zod** schemas for request validation (already a dependency). Key schemas:

- `CreateSessionSchema` — validates name (required), config (optional object), browser_session_id (optional string), sandbox_id (optional string)
- `UpdateSessionSchema` — all fields optional, validates types

---

## Database Migration

Single SQL migration file at `packages/backend/src/migrations/001_create_sessions.ts` using Kysely's migration API.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/backend/src/db.ts` | Add `sessions` and `session_messages` table types to `Database` interface |
| `packages/backend/src/migrations/001_create_sessions.ts` | Kysely migration |
| `packages/backend/src/schemas/session.ts` | Zod validation schemas |
| `packages/backend/src/routes/sessions.ts` | Hono route handlers |
| `packages/backend/src/index.ts` | Mount sessions routes |

---

## Verification

1. Run the Kysely migration against local PostgreSQL
2. `bun test` — unit tests for Zod schemas and route handlers
3. Manual curl/httpie calls against each endpoint to confirm CRUD operations
4. Verify jsonb columns accept and return SDK-shaped data correctly
