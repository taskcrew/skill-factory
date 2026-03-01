import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Frontend listening on http://localhost:${server.port}`);
