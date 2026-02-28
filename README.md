# Skill Factory

Bun workspaces monorepo.

## Packages

| Package | Port | Description |
| --- | --- | --- |
| `packages/backend` | 3001 | API server |
| `packages/frontend` | 3000 | React frontend with HMR |
| `packages/cc-server` | 3002 | Claude Code server (Daytona sandboxes) |
| `packages/chrome-extension` | — | Chrome extension (Manifest V3) |

## Setup

```bash
bun install
```

## Development

```bash
bun run dev:backend      # http://localhost:3001
bun run dev:frontend     # http://localhost:3000
bun run dev:cc-server    # http://localhost:3002
```

## Build

```bash
bun run build:chrome-extension   # outputs to packages/chrome-extension/dist/
bun run docker:cc-server         # builds Docker image for cc-server
```

## Test

```bash
bun test
```
