import { build } from "./app";
import { config } from "./config";
import { logger } from "./config/logger";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[UNHANDLED_REJECTION]");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "[UNCAUGHT_EXCEPTION]");
  process.exit(1);
});

const app = build();

Bun.serve({
  fetch: app.fetch,
  port: config.server.port,
  hostname: config.server.host,
});

logger.info(
  {
    host: config.server.host,
    port: config.server.port,
  },
  "cc-server listening",
);
