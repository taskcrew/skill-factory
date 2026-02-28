# Skill Factory Recorder Extension

Chrome Manifest V3 extension that records user browsing behavior (clicks, inputs, navigation, scrolls, keyboard events, drag-and-drop, text selection, and more) along with DOM snapshots. The output is a replayable workflow that AI agents can consume via agent-browser CLI scripts.

## Architecture

The extension has three core components plus an export subsystem.

### Core Components

| Component                     | Location          | Purpose                                                                                                                                                     |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Background service worker** | `src/background/` | Main controller. Manages recording state, handles messages from content scripts and popup, orchestrates screenshots.                                        |
| **Content scripts**           | `src/content/`    | Injected into every page (and every iframe via `all_frames: true`). Captures DOM events, generates selectors, and sends recorded events to the background.  |
| **Popup UI**                  | `src/popup/`      | Start/stop/pause controls, real-time event count, export button (MCP), and backend upload with API key authentication.                                      |

### Export Format

| Format                   | File                  | Output                                                                               |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| MCP (chrome-devtools)    | `src/export/mcp.ts`   | `.mcp.json` workflow using hash-based UIDs that match the MCP chrome-devtools server |

### Iframe Support

Content scripts run in all frames (`all_frames: true`, `match_about_blank: true`). The `src/content/frame-path.ts` module computes a deterministic index-based path from the current frame to the top frame. This allows recorded events inside iframes to be replayed correctly.

**Important:** The manifest is defined in `vite.config.ts` (the inline `manifest()` function), NOT in `src/manifest.json`. The `vite-plugin-web-extension` plugin generates the manifest at build time from the inline definition. `src/manifest.json` exists for reference only and is not read by the build. If you need to change permissions, content script config, or other manifest fields, edit `vite.config.ts`.

### Message Flow

1. Popup sends `START_RECORDING` to the background service worker.
2. Background creates a session and broadcasts `RECORDING_STATE_CHANGED` to all tabs.
3. Content scripts attach event listeners (capture phase) and send `RECORD_EVENT` messages to background.
4. Background stores events and optionally captures screenshots (rate-limited to 500ms).
5. On `STOP_RECORDING`, the session is finalized and export/upload becomes available.

## Development

### Prerequisites

- Node.js >= 18
- pnpm 10.x
- Chrome (for loading the unpacked extension)

### Install

```bash
pnpm install
```

### Dev Mode (with hot reload)

```bash
pnpm dev
```

Runs `vite build --watch --mode development` with inline source maps. The `dist/` directory updates automatically on file changes. After the initial build, load the unpacked extension once (see below) and Chrome will pick up changes when you reload the extension.

### Production Build

```bash
pnpm build
```

Runs `vite build --mode production` with no source maps. Output goes to `dist/`.

### Type Checking

```bash
pnpm typecheck
```

### Loading the Unpacked Extension in Chrome

1. Run `pnpm build` (or `pnpm dev` for development).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the `dist/` directory.
5. The extension icon appears in the toolbar. Click it to open the popup UI.

After loading once, subsequent builds only require clicking the reload button on the extension card in `chrome://extensions`, or pressing Ctrl+R on the extensions page.
