/**
 * Frontend runtime configuration.
 *
 * Bun inlines process.env.PUBLIC_* at build time via bunfig.toml.
 * Set PUBLIC_BACKEND_URL in .env to override.
 */
export const BACKEND_URL = process.env.PUBLIC_BACKEND_URL ?? "http://localhost:3001";
