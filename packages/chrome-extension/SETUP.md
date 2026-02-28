# Local Setup Guide

How to build and install the Skill Factory Recorder extension in your Chrome browser.

## Prerequisites

- **Bun** (v1.0+) — the monorepo package manager
- **Chrome** (or Chromium-based browser) — where you'll load the extension
- No separate Node.js installation needed — Bun handles everything

## Quick Start

```bash
# 1. From the monorepo root, install all dependencies
bun install

# 2. Build the extension
bun run build:chrome-extension

# 3. Load in Chrome (see steps below)
```

## Step-by-Step

### 1. Install Dependencies

From the **monorepo root** (`skill-factory/`):

```bash
bun install
```

This installs deps for all workspace packages, including the chrome extension's Vite and TypeScript toolchain.

### 2. Build the Extension

Either from the monorepo root:

```bash
bun run build:chrome-extension
```

Or directly from the extension package:

```bash
cd packages/chrome-extension
bun run build
```

This runs `vite build --mode production` and outputs the compiled extension to `packages/chrome-extension/dist/`.

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `packages/chrome-extension/dist/` directory
5. The **Skill Factory Recorder** icon appears in your toolbar

### 4. Start Recording

1. Navigate to the page you want to record
2. Click the extension icon in the toolbar to open the popup
3. Click **Start Recording**
4. Browse normally — clicks, inputs, scrolls, navigation, and keyboard events are all captured
5. Click **Stop Recording** when done
6. Export or upload the recording from the popup

## Development Mode

For live-reloading during development:

```bash
cd packages/chrome-extension
bun run dev
```

This runs `vite build --watch` with inline source maps. The `dist/` directory updates on every file change.

After loading the extension once (step 3 above), you just need to:
- Click the **reload** button on the extension card in `chrome://extensions`
- Or press `Ctrl+R` / `Cmd+R` on the extensions page

## Troubleshooting

### Extension doesn't appear after loading
Make sure you selected the `dist/` directory (not `src/` or the package root).

### Changes not reflected
After rebuilding, you must reload the extension in `chrome://extensions`. Chrome doesn't auto-reload unpacked extensions.

### Build fails with missing dependencies
Run `bun install` from the monorepo root to ensure all workspace dependencies are resolved.

### Type errors during build
Run `bun run --cwd packages/chrome-extension typecheck` to see TypeScript errors before building.
