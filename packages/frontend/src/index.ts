import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",
  routes: {
    "/*": index,
  },
  development:
    process.env.NODE_ENV !== "production"
      ? { hmr: true, console: true }
      : false,
});

console.log(`Frontend listening on http://localhost:${server.port}`);
