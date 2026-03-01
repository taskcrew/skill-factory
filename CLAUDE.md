# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skill Factory — a platform that records user browser activity via a Chrome extension, translates recordings into reusable "skills," and runs browser automation agents using the Claude Code Agent SDK in sandboxed environments. Hackathon MVP: optimize for wow factor over polish.

## Commands

```bash
bun install                        # Install all workspace dependencies
bun run dev:backend                # Backend API server — http://localhost:3001
bun run dev:frontend               # React frontend with HMR — http://localhost:3000
bun run dev:cc-server              # Claude Code server — http://localhost:3002
bun run build:chrome-extension     # Build extension → packages/chrome-extension/dist/
bun run docker:cc-server           # Docker image for cc-server
bun test                           # Run all tests
bun test packages/backend          # Run tests for a single package
```

## Architecture

Bun workspaces monorepo (`packages/*`). All servers use `Bun.serve()` with route objects.

| Package | Port | Stack | Purpose |
|---|---|---|---|
| `backend` | 3001 | Hono, Kysely, pg, Socket.IO, Zod | REST API + real-time events. PostgreSQL for sessions/skills storage |
| `frontend` | 3000 | React 19, Bun HTML imports | Chat UI with agent trajectory viewer and browser preview iframe |
| `cc-server` | 3002 | @anthropic-ai/claude-code SDK, @daytonaio/sdk, Hono, Pino | Runs Claude Code Agent SDK sessions inside Daytona sandboxes |
| `chrome-extension` | — | Manifest V3, bun build --target browser | Records user browser activity (keylogs) and uploads to backend |

### Data Flow

1. **Chrome extension** captures user interactions → uploads recordings to **backend**
2. **Backend** stores recordings, translates them into skills, exposes sessions API
3. **Frontend** creates chat sessions, picks skills, shows real-time agent trajectory via Socket.IO
4. **Backend** delegates agent execution to **cc-server**, which runs Claude Code SDK in Daytona sandboxes
5. **cc-server** streams agent progress back through backend to frontend

### Key Conventions

- **Bun-first**: Use `bun` for everything — no Node.js, npm, Vite, Express, or dotenv. Bun auto-loads `.env`.
- **Bun.serve()** for all HTTP servers with route objects. No Express/Hono standalone server — Hono is used as middleware within `Bun.serve()`.
- **Frontend**: Bun HTML imports (`import index from "./index.html"`), React 19, HMR via `development: { hmr: true }`. No Vite/webpack.
- **TypeScript**: Strict mode, composite project references, bundler module resolution, no emit.
- **Backend DB**: PostgreSQL via `kysely` query builder + `pg` driver. Migrations in `src/migrations/`.
- **Validation**: Zod schemas for request/response validation.
- **Chrome Extension**: Built with `bun build --target browser --splitting`. Output in `dist/`.
- **Real-time**: Socket.IO with `@socket.io/bun-engine` adapter for WebSocket transport.

### Bun API Preferences

- `Bun.serve()` for HTTP/WebSocket servers (not Express)
- `Bun.file()` over `node:fs` readFile/writeFile
- `Bun.$\`cmd\`` over execa
- `bun:test` for testing (`import { test, expect } from "bun:test"`)
- Bun auto-loads `.env` — don't import dotenv
- Read Bun API docs at `node_modules/bun-types/docs/**.mdx`
