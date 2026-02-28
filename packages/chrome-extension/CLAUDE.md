# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension for recording user browsing behavior, designed to capture workflows for AI agent training/reproduction. Part of the Skill Factory project. Uses Manifest V3 with TypeScript and Vite.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the extension for production
pnpm build

# Development mode with hot reload
pnpm dev

# Type checking
pnpm typecheck
```

## Loading the Extension

1. Run `pnpm build`
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` directory

## Architecture

### Three Core Components

**Background Service Worker** (`src/background/`)

- `index.ts` - Main controller, message handling, orchestrates all background operations
- `state.ts` - RecordingStateManager persists recording state to chrome.storage.local
- `screenshot.ts` - Captures tab screenshots using chrome.tabs.captureVisibleTab (rate-limited to 500ms)
- `coordinator.ts` - Syncs recording state to all tabs via message passing

**Content Scripts** (`src/content/`)

- `index.ts` - ContentScriptController, initializes event capturing when recording starts
- `events/` - Individual event handlers (click, input, scroll, navigation, hover, dragdrop, keyboard, selection)
- `events/index.ts` - EventOrchestrator manages all handlers and buffers events before sending to background
- `selectors/index.ts` - SelectorGenerator creates CSS, XPath, test-id, aria, and text-based selectors
- `snapshot/index.ts` - DOM snapshot serialization

**Popup UI** (`src/popup/`)

- Controls for start/stop/pause recording
- Real-time event count display
- Export button (MCP workflow)
- Backend upload with API key authentication

### Shared Types (`src/shared/types/`)

- `events.ts` - RecordedEvent types (ClickEvent, InputEvent, ScrollEvent, etc.)
- `recording.ts` - RecordingSession, RecordingStatus, RecordingSettings
- `messages.ts` - Message types for component communication
- `export.ts` - Export format types

### Export Format (`src/export/`)

- `mcp.ts` - MCP workflow JSON (to be replaced with agent-browser CLI export)

### API Client (`src/api/`)

- `client.ts` - REST API upload with X-API-Key authentication

## Message Flow

1. Popup sends `START_RECORDING` to background
2. Background creates session, notifies all tabs via `RECORDING_STATE_CHANGED`
3. Content scripts attach event listeners, send `RECORD_EVENT` messages to background
4. Background stores events, optionally captures screenshots
5. On `STOP_RECORDING`, session is saved and export/upload becomes available

## Key Design Patterns

- Event handlers use capture phase (`{ capture: true }`) for reliable event interception
- Events are queued in content script and flushed every 100ms (or immediately for clicks/navigation)
- Selectors prioritize: testId > aria > CSS > XPath
- Password fields are masked when `maskInputs: true`
- Scroll events are debounced (150ms default)
- Hover events require threshold (1000ms default) before recording
