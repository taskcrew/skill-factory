import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { EventEmitter } from "node:events";

import type { AppEnv } from "../types/hono-env";
import type { ExecuteRequest, LifecycleEvent, SseEventType } from "../shared/types";

function toSseData(event: unknown): string {
  return JSON.stringify(event);
}

type ClaudeExecutorLike = Pick<EventEmitter, "on" | "off"> & {
  executeTaskIterator: (request: ExecuteRequest) => AsyncGenerator<unknown, void>;
};

export function executeHandler(executor: ClaudeExecutorLike) {
  return async (c: Context<AppEnv>) => {
    let body: ExecuteRequest;

    try {
      body = await c.req.json<ExecuteRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.task?.trim()) {
      return c.json({ error: "task is required" }, 400);
    }

    return streamSSE(c, async (stream) => {
      const lifecycleListener = async (event: LifecycleEvent) => {
        await stream.writeSSE({
          event: "lifecycle" satisfies SseEventType,
          data: toSseData(event),
        });
      };

      executor.on("lifecycle", lifecycleListener);

      try {
        for await (const message of executor.executeTaskIterator(body)) {
          await stream.writeSSE({
            event: "message" satisfies SseEventType,
            data: toSseData(message),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await stream.writeSSE({
          event: "error" satisfies SseEventType,
          data: toSseData({ error: message }),
        });
      } finally {
        executor.off("lifecycle", lifecycleListener);
      }
    });
  };
}
