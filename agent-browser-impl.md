# Agent Browser Implementation Spec

## Overview

Replace the Browserbase-powered headless recording pipeline with a **headful, locally-controlled** architecture using [agent-browser](https://github.com/vercel-labs/agent-browser) CLI. The chrome extension captures browser events in the user's own Chrome, streams them to a backend, and the backend generates **agent-browser CLI scripts** (instead of MCP tool calls or Playwright/Puppeteer code).

```
User browses → Extension captures events → Backend receives stream
    → Backend generates agent-browser CLI skill → Agent learns pattern
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM OVERVIEW                             │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐      ┌──────────────┐      ┌────────────────────┐
  │   Frontend   │      │   Backend    │      │  GCS               │
  │ (taskcrew-fe)│─────>│ (backend-node│─────>│  (Event Storage)   │
  └──────────────┘      └──────────────┘      └────────────────────┘
         │                     │
         │                     │              ┌────────────────────────┐
         └─────────────────────┼─────────────│ Chrome Extension        │
                               │              │ (Installed in user's   │
                               │              │  own Chrome browser)   │
                               │              └────────────────────────┘
                               │                           │
                               │<──────────────────────────┘
                                    POST /recordings/:id/stream
```

### What Changed from Original

| Component | Original | New |
|-----------|----------|-----|
| **Browser** | Browserbase remote headless | User's local Chrome (headful) |
| **Extension delivery** | Uploaded to Browserbase, loaded automatically | User installs manually (or via `--load-extension`) |
| **Config injection** | CDP cookie injection via Browserbase WebSocket | Extension popup settings (backend URL + API key) |
| **Output format** | MCP tool calls / Playwright / Puppeteer | **agent-browser CLI scripts** |
| **Event storage** | GCS (kept) | GCS (kept) |
| **Skill generation** | SKILL.md from events | SKILL.md with agent-browser CLI commands |

---

## Components to Copy from chrome-recorder-extension

### Keep (copy into skill-factory)

| Directory | Purpose | Notes |
|-----------|---------|-------|
| `src/content/` | Event capture (click, input, scroll, etc.) | Core value — unchanged |
| `src/content/events/` | All event handlers | Unchanged |
| `src/content/selectors/` | SelectorGenerator + hash UIDs | Unchanged |
| `src/content/frame-path.ts` | Iframe detection | Unchanged |
| `src/background/index.ts` | BackgroundController | Modify: remove CDP/headless logic |
| `src/background/state.ts` | RecordingStateManager | Unchanged |
| `src/background/coordinator.ts` | TabCoordinator | Unchanged |
| `src/background/screenshot.ts` | Screenshot capture | Unchanged |
| `src/popup/` | Popup UI | Modify: add backend URL config |
| `src/shared/types/` | Event types, message types | Unchanged |
| `src/shared/utils/` | Utilities | Unchanged |
| `src/api/client.ts` | Backend upload client | Modify: becomes primary streaming client |
| `vite.config.ts` | Build config | Adapt for new project |

### Remove (do not copy)

| Directory | Reason |
|-----------|--------|
| `src/headless/headless-controller.ts` | No Browserbase = no headless auto-start |
| `src/headless/config-loader.ts` | No CDP cookie injection needed |
| `src/headless/remote-logger.ts` | No remote debug logging needed |
| `scripts/upload-extension.ts` | No Browserbase extension upload |

### Replace

| Original | Replacement |
|----------|-------------|
| `src/headless/stream-uploader.ts` | Move streaming logic into `src/api/streaming-client.ts` — used by the extension in normal (non-headless) mode |
| `src/export/mcp.ts` | `src/export/agent-browser.ts` — new export format |
| `src/export/puppeteer.ts` | Remove (or keep as optional) |
| `src/export/playwright.ts` | Remove (or keep as optional) |
| `src/export/devtools.ts` | Remove (or keep as optional) |

---

## New Export Format: agent-browser CLI

### Event → CLI Command Mapping

| Recorded Event | agent-browser Command | Example |
|---|---|---|
| `click` | `agent-browser click` | `agent-browser click @e1` |
| `doubleClick` | `agent-browser double-click` | `agent-browser double-click @e1` |
| `rightClick` | `agent-browser click --button right` | `agent-browser click @e1 --button right` |
| `input` / `change` | `agent-browser fill` | `agent-browser fill @e1 "user@example.com"` |
| `navigate` | `agent-browser open` | `agent-browser open "https://example.com/page"` |
| `scroll` | `agent-browser scroll` | `agent-browser scroll down 500` |
| `keyDown` | `agent-browser press` | `agent-browser press Enter` |
| `hover` | `agent-browser hover` | `agent-browser hover @e1` |
| `drop` (drag) | `agent-browser drag @from @to` | (if supported) |
| `submit` | `agent-browser press Enter` | `agent-browser press Enter` |
| `tabCreated` | `agent-browser tab new` | `agent-browser tab new "https://url"` |
| `tabActivated` | `agent-browser tab switch` | `agent-browser tab switch 2` |
| `screenshot` | `agent-browser screenshot` | `agent-browser screenshot step-3.png` |

### Selector Mapping: Extension UIDs → agent-browser Refs

The extension generates **hash-based UIDs** (e.g., `$a1b2c3d4`) while agent-browser uses **snapshot refs** (e.g., `@e1`). These are fundamentally different:

- **Extension UIDs**: Computed from DOM position, stable across reloads
- **agent-browser refs**: Assigned during `snapshot -i`, reset each snapshot

**Resolution strategy**: In the generated CLI script, we use **semantic locators** (agent-browser's `find` command) as the primary targeting mechanism, with fallback selectors:

```bash
# Primary: semantic locator (matches ARIA/role/label)
agent-browser find label "Email" fill "user@example.com"

# Alternative: role-based
agent-browser find role textbox fill "user@example.com" --name "Email"

# Alternative: test-id based (most stable)
agent-browser find testid "email-input" fill "user@example.com"

# Fallback: snapshot + ref (requires preceding snapshot)
agent-browser snapshot -i
agent-browser fill @e3 "user@example.com"
```

### Generated Script Format

```bash
#!/bin/bash
# Skill: Login to Dashboard
# Recorded: 2026-02-28
# Source URL: https://app.example.com/login

# Step 1: Navigate to login page
agent-browser open "https://app.example.com/login"
agent-browser wait --load networkidle

# Step 2: Fill email
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
# Fallback: agent-browser find testid "email-input" fill "user@example.com"

# Step 3: Fill password
agent-browser fill @e2 "********"
# Fallback: agent-browser find testid "password-input" fill "********"

# Step 4: Click login button
agent-browser click @e3
# Fallback: agent-browser find role button click --name "Log in"

# Step 5: Wait for dashboard
agent-browser wait --url "**/dashboard"
agent-browser wait --load networkidle

# Verify: Take screenshot of final state
agent-browser screenshot dashboard-loaded.png
```

### Smart Script Generation Rules

1. **Insert `snapshot -i` before first interaction on a new page** — refs are only valid after a snapshot
2. **Insert `wait` after navigation-triggering actions** (clicks that cause page loads, form submits)
3. **Re-snapshot after navigation** — refs are invalidated by DOM changes
4. **Use `find` with semantic locators as primary**, `@ref` as secondary (refs are session-dependent)
5. **Merge consecutive fills** on same element (keep last value)
6. **Remove hover before click** on same element (redundant)
7. **Mask passwords** — replace with `********` and add comment

---

## Recording Flow (Updated)

```
  Frontend                    Backend                    Extension (local Chrome)
     │                           │                           │
     │  1. POST /recordings/start                            │
     │      { agentId, skillName }                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │  2. Return { sessionId,   │                           │
     │     streamEndpoint }      │                           │
     │<──────────────────────────│                           │
     │                           │                           │
     │  3. Display sessionId     │                           │
     │     to user               │                           │
     │                           │                           │
     │                           │  4. User enters sessionId │
     │                           │     + backend URL in      │
     │                           │     extension popup       │
     │                           │                           │
     │                           │  5. User clicks "Start    │
     │                           │     Recording" in popup   │
     │                           │                           │
     │                           │  6. Extension captures    │
     │                           │     events normally       │
     │                           │                           │
     │                           │  7. Events streamed       │
     │                           │<─────────────────────────-│
     │                           │     POST /stream          │
     │                           │     { batchNumber, events }│
     │                           │                           │
     │                           │  8. Append to GCS JSONL   │
     │                           │                           │
     │  9. User clicks "Stop"    │                           │
     │     (in popup or frontend)│                           │
     │                           │                           │
     │ 10. POST /recordings/:id/complete                     │
     │──────────────────────────>│                           │
     │                           │                           │
     │                           │ 11. Download events       │
     │                           │     from GCS              │
     │                           │                           │
     │                           │ 12. Generate SKILL.md     │
     │                           │     + agent-browser script│
     │                           │                           │
     │                           │ 13. Upload to GCS         │
     │                           │                           │
     │ 14. Return { skillId,     │                           │
     │     script }              │                           │
     │<──────────────────────────│                           │
```

### Key Differences from Original Flow

1. **No Browserbase session creation** — user's own browser
2. **No CDP config injection** — user enters config in popup
3. **Extension popup is the control surface** — Start/Stop Recording
4. **Streaming uses same endpoint** — `POST /recordings/:id/stream`
5. **GCS flow unchanged** — events stored as JSONL, downloaded on complete
6. **Output is agent-browser CLI script** — not MCP workflow

---

## Extension Config (Replaces CDP Injection)

### Popup Settings

The extension popup provides fields for:

```typescript
interface ExtensionConfig {
  backendUrl: string;       // e.g., "https://api.duvo.com/v1"
  apiKey: string;           // JWT bearer token
  sessionId?: string;       // Set when recording starts (from backend)
}
```

Stored in `chrome.storage.local`, persisted across browser restarts.

### Recording Start Flow

1. User opens popup, enters `backendUrl` + `apiKey` (one-time setup)
2. User clicks "Start Recording"
3. Extension calls `POST {backendUrl}/recordings/start` with `apiKey`
4. Backend returns `{ sessionId }`
5. Extension stores `sessionId`, begins capturing events
6. Events streamed to `POST {backendUrl}/recordings/{sessionId}/stream`

This replaces the entire Browserbase + CDP injection chain.

---

## Backend Changes

### Endpoints (Unchanged)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/recordings/start` | POST | Create session, status: "browsing" |
| `/v1/recordings/:sessionId/stream` | POST | Receive event batches |
| `/v1/recordings/:sessionId/complete` | POST | Generate skill |

### Removed Endpoint

| Endpoint | Reason |
|----------|--------|
| `/v1/recordings/:sessionId/begin` | Was for CDP config injection — no longer needed |

### Skill Generation Output

On `/complete`, the backend now generates:

```
skills-bucket/
└── {teamId}/
    └── {skillId}/
        ├── SKILL.md              # Human-readable skill doc
        ├── workflow.sh           # agent-browser CLI script
        └── assets/
            └── workflow.json     # Structured event data (for re-processing)
```

---

## Environment Variables

### Removed

| Variable | Reason |
|----------|--------|
| `BROWSERBASE_API_KEY` | No Browserbase |
| `BROWSERBASE_PROJECT_ID` | No Browserbase |
| `BROWSERBASE_EXTENSION_ID` | No Browserbase |

### Kept

| Variable | Description |
|----------|-------------|
| `BACKEND_NODE_URL` | Public URL for extension callbacks |
| `GCS_RECORDING_SESSION_BUCKET` | GCS bucket for raw events |
| `GCS_TEAM_SKILLS_BUCKET` | GCS bucket for generated skills |

---

## Data Structures

### HeadlessRecordingConfig → ExtensionRecordingConfig

```typescript
// OLD (removed)
interface HeadlessRecordingConfig {
  sessionId: string;
  browserbaseSessionId: string;  // removed
  agentId: string;
  teamId: string;
  userId: string;
  skillName?: string;
  skillDescription?: string;
  streamEndpoint: string;
  authToken: string;
}

// NEW
interface ExtensionRecordingConfig {
  sessionId: string;
  agentId: string;
  teamId: string;
  userId: string;
  skillName?: string;
  skillDescription?: string;
  streamEndpoint: string;
  authToken: string;
}
```

### RecordedEvent (Unchanged)

All event types remain the same. The only change is in how they're **consumed** — the export layer converts them to agent-browser CLI commands instead of MCP tool calls.

---

## Database Changes

### `recording_session` Table

| Column | Change |
|--------|--------|
| `bb_session_id` | **Remove** — no Browserbase session |
| All others | Unchanged |

---

## Open Questions

1. **Skill generation engine**: LLM-based or template-based? (deferred)
2. **Local export**: Should the extension also support exporting agent-browser scripts locally (without backend), for debugging/testing?
3. **agent-browser `find` vs `@ref`**: Should generated scripts prefer semantic `find` commands (portable) or `snapshot` + `@ref` (faster but session-dependent)?
4. **Session linking**: How does the frontend know which extension instance is recording? (polling sessionId status?)

---

## Implementation Order

1. **Copy extension source** into skill-factory repo
2. **Remove headless/Browserbase code** (`src/headless/`, `scripts/upload-extension.ts`)
3. **Update popup** with backend URL / API key config fields
4. **Wire popup → backend** for session creation (replaces CDP injection)
5. **Move StreamUploader logic** into normal extension flow (not headless-only)
6. **Create `src/export/agent-browser.ts`** — new export format
7. **Update backend** to generate agent-browser CLI scripts on `/complete`
8. **Test end-to-end** — record in Chrome → stream to backend → generate CLI script
