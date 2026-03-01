import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { db } from "../db";
import { logger } from "../logger";
import {
  AgentExecuteRequestSchema,
  AgentQueryRequestSchema,
  AgentQueryResultSchema,
} from "../schemas/agent";
import { ErrorSchema, SessionSchema } from "../schemas/session";
import { persistMessages } from "../services/persist-messages";
import { sandboxManager } from "../services/sandbox";

const log = logger.child({ service: "agent-proxy" });

export const agentRouter = new OpenAPIHono();

// POST /:id/query — One-shot proxy to cc-server
const queryRoute = createRoute({
  method: "post",
  path: "/{id}/query",
  tags: ["Agent"],
  summary: "Proxy one-shot query to sandbox cc-server",
  request: {
    params: SessionSchema.pick({ id: true }),
    body: {
      content: { "application/json": { schema: AgentQueryRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Query result from cc-server",
      content: { "application/json": { schema: AgentQueryResultSchema } },
    },
    404: {
      description: "Session or sandbox not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Upstream cc-server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

agentRouter.openapi(queryRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (!session.sandbox_id) {
    return c.json({ error: "Session has no sandbox" }, 404);
  }

  const info = sandboxManager.getSandboxInfo(session.sandbox_id);
  if (!info) {
    return c.json({ error: "Sandbox not found in manager" }, 404);
  }

  const upstream = await fetch(`${info.baseUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-daytona-preview-token": info.previewToken,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    log.error(
      { status: upstream.status, body: text.slice(0, 500) },
      "cc-server query failed",
    );
    return c.json({ error: `cc-server returned ${upstream.status}` }, 502);
  }

  const result = (await upstream.json()) as {
    messages: unknown[];
    result: string | null;
    structuredOutput?: unknown;
  };

  // Persist messages fire-and-forget
  if (result.messages?.length) {
    persistMessages(id, result.messages).catch((err) =>
      log.error({ err, sessionId: id }, "Failed to persist query messages"),
    );
  }

  return c.json(result as any, 200);
});

// POST /:id/execute — SSE streaming proxy to cc-server
const executeRoute = createRoute({
  method: "post",
  path: "/{id}/execute",
  tags: ["Agent"],
  summary: "Proxy streaming SSE execution to sandbox cc-server",
  request: {
    params: SessionSchema.pick({ id: true }),
    body: {
      content: { "application/json": { schema: AgentExecuteRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "SSE stream from cc-server",
    },
    404: {
      description: "Session or sandbox not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Upstream cc-server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

agentRouter.openapi(executeRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (!session.sandbox_id) {
    return c.json({ error: "Session has no sandbox" }, 404);
  }

  const info = sandboxManager.getSandboxInfo(session.sandbox_id);
  if (!info) {
    return c.json({ error: "Sandbox not found in manager" }, 404);
  }

  const upstream = await fetch(`${info.baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-daytona-preview-token": info.previewToken,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    log.error(
      { status: upstream.status, body: text.slice(0, 500) },
      "cc-server execute failed",
    );
    return c.json({ error: `cc-server returned ${upstream.status}` }, 502);
  }

  if (!upstream.body) {
    return c.json({ error: "No response body from cc-server" }, 502);
  }

  // Pipe SSE stream, tapping "message" events for persistence
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      // Forward raw chunk to client
      controller.enqueue(value);

      // Parse SSE lines to tap message events for persistence
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ") && currentEvent === "message") {
          try {
            const messages = JSON.parse(line.slice(6));
            if (Array.isArray(messages)) {
              persistMessages(id, messages).catch((err) =>
                log.error(
                  { err, sessionId: id },
                  "Failed to persist execute messages",
                ),
              );
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

