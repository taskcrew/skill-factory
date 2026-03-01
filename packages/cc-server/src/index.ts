import { serve } from "@hono/node-server";
import { build } from "./app";
import { config } from "./config";
import { logger } from "./config/logger";
import { StreamingClaudeExecutor } from "./services/claude-executor";
import { SandboxManager } from "./services/sandbox-manager";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[UNHANDLED_REJECTION]");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "[UNCAUGHT_EXCEPTION]");
  process.exit(1);
});

const sandboxManager = config.daytona.apiKey
  ? new SandboxManager()
  : undefined;

const app = build(new StreamingClaudeExecutor(), sandboxManager);

serve(
  {
    fetch: app.fetch,
    port: config.server.port,
    hostname: config.server.host,
  },
  () => {
    logger.info(
      {
        host: config.server.host,
        port: config.server.port,
        sandboxManagement: sandboxManager ? "enabled" : "disabled",
      },
      "cc-server listening",
    );
  },
);
