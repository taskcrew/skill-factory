/**
 * Bun inlines process.env.PUBLIC_* at bundle time via bunfig.toml [serve.static] env.
 * The expression must be exactly `process.env.PUBLIC_X` — no typeof guards or
 * optional chaining, otherwise Bun's bundler won't recognize and replace it.
 */
export const BACKEND_URL: string =
  process.env.PUBLIC_BACKEND_URL || "http://localhost:3001";
