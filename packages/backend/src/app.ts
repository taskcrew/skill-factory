import { OpenAPIHono } from "@hono/zod-openapi";

export function buildBaseApp() {
  const app = new OpenAPIHono();

  app.get("/api/health", (c) => c.json({ status: "ok", service: "backend" }));

  return app;
}
