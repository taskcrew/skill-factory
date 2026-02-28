import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import healthRoutes from "./routes/health";
import { engine } from "./socket";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => {
  return c.json({ message: "backend ok" });
});

app.route("/api", healthRoutes);

export { app };

const { websocket } = engine.handler();

export default {
  port: 3001,
  idleTimeout: 30,
  fetch(req: Request, server: any) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/socket.io/")) {
      return engine.handleRequest(req, server);
    }
    return app.fetch(req, server);
  },
  websocket,
};
