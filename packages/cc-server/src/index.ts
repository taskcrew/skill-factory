const server = Bun.serve({
  port: 3002,
  routes: {
    "/": new Response("cc-server ok"),
    "/api/health": {
      GET: () => Response.json({ status: "ok", service: "cc-server" }),
    },
  },
});

console.log(`cc-server listening on http://localhost:${server.port}`);
