import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import healthRoutes from "./routes/health";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => {
  return c.json({ message: "backend ok" });
});

app.route("/api", healthRoutes);

export { app };

export default {
  port: 3001,
  fetch: app.fetch,
};
