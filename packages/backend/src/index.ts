import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { sessionsRouter } from "./routes/sessions";

const app = new OpenAPIHono();

app.get("/api/health", (c) => c.json({ status: "ok", service: "backend" }));
app.route("/api/sessions", sessionsRouter);

app.doc31("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Skill Factory API",
    version: "0.1.0",
    description: "Agent SDK session management API",
  },
});

app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

const server = Bun.serve({
  port: Number(process.env.PORT) || 3001,
  fetch: app.fetch,
});

console.log(`Backend listening on http://localhost:${server.port}`);
