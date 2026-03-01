import index from "./index.html";

const BACKEND_URL = process.env.PUBLIC_BACKEND_URL || "http://localhost:3001";

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",
  routes: {
    "/env.js": new Response(
      `window.__BACKEND_URL = ${JSON.stringify(BACKEND_URL)};`,
      { headers: { "Content-Type": "application/javascript" } },
    ),
    "/*": index,
  },
  development:
    process.env.NODE_ENV !== "production"
      ? { hmr: true, console: true }
      : false,
});

console.log(`Frontend listening on http://localhost:${server.port}`);
