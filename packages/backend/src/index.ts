import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { config } from "./config";
import { logger } from "./logger";
import { sessionsRouter } from "./routes/sessions";
import { SandboxManager } from "./services/sandbox-manager";

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

const sandboxManager = new SandboxManager();

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
});

logger.info({ port: server.port }, "Backend listening");
