/**
 * Set by /env.js which the server generates from process.env.PUBLIC_BACKEND_URL.
 * Loaded via a <script> tag in index.html before the app bundle runs.
 */
export const BACKEND_URL: string =
  (window as any).__BACKEND_URL || "http://localhost:3001";
