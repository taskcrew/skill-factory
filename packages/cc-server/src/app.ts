import { Hono } from "hono";
import { cors } from "hono/cors";
import type { EventEmitter } from "node:events";

import { logger } from "./config/logger";
import { executeHandler } from "./handlers/execute";
import { queryHandler } from "./handlers/query";
import {
  createSandboxHandler,
  destroySandboxHandler,
  proxySandboxExecuteHandler,
  proxySandboxQueryHandler,
} from "./handlers/sandbox";
import { StreamingClaudeExecutor } from "./services/claude-executor";
import type { SandboxManager } from "./services/sandbox-manager";
import type { ExecuteRequest } from "./shared/types";
import type { AppEnv } from "./types/hono-env";

const startTime = Date.now();

type ClaudeExecutorLike = Pick<EventEmitter, "on" | "off"> & {
  executeTaskIterator: (request: ExecuteRequest) => AsyncGenerator<unknown, void>;
};

export function build(
  executor: ClaudeExecutorLike = new StreamingClaudeExecutor(),
  sandboxManager?: SandboxManager,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", cors());

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    const requestLogger = logger.child({
      requestId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set("requestId", requestId);
    c.set("log", requestLogger);

    const startedAt = Date.now();
    await next();

    requestLogger.info(
      {
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      },
      "Request completed",
    );
  });

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  app.post("/execute", executeHandler(executor));
  app.post("/query", queryHandler());

  if (sandboxManager) {
    app.post("/sandbox", createSandboxHandler(sandboxManager));
    app.delete("/sandbox/:id", destroySandboxHandler(sandboxManager));
    app.post("/sandbox/:id/execute", proxySandboxExecuteHandler(sandboxManager));
    app.post("/sandbox/:id/query", proxySandboxQueryHandler(sandboxManager));
  }

  return app;
}
