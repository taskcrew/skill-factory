const server = Bun.serve({
  port: Number(process.env.PORT) || 3001,
  routes: {
    "/": new Response("backend ok"),
    "/api/health": {
      GET: () => Response.json({ status: "ok", service: "backend" }),
    },
  },
});

console.log(`Backend listening on http://localhost:${server.port}`);
