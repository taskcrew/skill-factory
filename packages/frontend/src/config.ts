/**
 * Frontend runtime configuration.
 *
 * Bun inlines process.env.PUBLIC_* at serve time via bunfig.toml [serve.static] env.
 * Falls back to window.location.origin port 3001 for dev, or use globalThis.
 */
export const BACKEND_URL: string =
  (typeof process !== "undefined" && process.env?.PUBLIC_BACKEND_URL) ||
  "http://localhost:3001";
