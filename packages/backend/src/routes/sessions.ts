import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "kysely";
import { db } from "../db";
import { logger } from "../logger";
import {
  BrowserPreviewSchema,
  CreateMessageSchema,
  CreateSessionSchema,
  ErrorSchema,
  ListSessionsQuerySchema,
  PaginatedSessionsSchema,
  SessionMessageSchema,
  SessionSchema,
  SessionWithMessagesSchema,
  UpdateSessionSchema,
} from "../schemas/session";
import { BrowserUseService } from "../services/browser-use";
import { sandboxManager } from "../services/sandbox";

const log = logger.child({ service: "sessions" });
const browserUseService = new BrowserUseService();

export const sessionsRouter = new OpenAPIHono();

// POST / — Create a new session
const createSession = createRoute({
  method: "post",
  path: "/",
  tags: ["Sessions"],
  summary: "Create a new session",
  request: {
    body: {
      content: { "application/json": { schema: CreateSessionSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Session created",
      content: { "application/json": { schema: SessionSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

sessionsRouter.openapi(createSession, async (c) => {
  const body = c.req.valid("json");

  // 1. Create Browser Use session (mandatory)
  let browserSessionId: string | null = body.browser_session_id ?? null;
  let cdpWsUrl: string | null = null;

  if (!browserSessionId) {
    const browserSession = await browserUseService.createSession();
    browserSessionId = browserSession.id;

    // Poll for CDP WebSocket URL (browser may take a few seconds to start)
    const pollDeadline = Date.now() + 30_000;
    const pollInterval = 1_000;
    while (Date.now() < pollDeadline) {
      const info = await browserUseService.getSessionInfo(browserSessionId);
      if (info.cdpWsUrl) {
        cdpWsUrl = info.cdpWsUrl;
        break;
      }
      await Bun.sleep(pollInterval);
    }

    if (!cdpWsUrl) {
      throw new Error(
        `Browser session ${browserSessionId} created but CDP URL not available within 30s timeout`,
      );
    }
  }

  // 2. Insert session row with browser_session_id
  let session = await db
    .insertInto("sessions")
    .values({
      name: body.name,
      config: JSON.stringify(body.config),
      skill_id: body.skill_id ?? null,
      browser_session_id: browserSessionId,
      sandbox_id: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Persist initial message if provided
  if (body.initial_message) {
    await db
      .insertInto("session_messages")
      .values({
        session_id: session.id,
        type: "user",
        content: JSON.stringify({
          role: "user",
          content: [{ type: "text", text: body.initial_message }],
        }),
      })
      .execute();
  }

  // 3. Create Daytona sandbox with CDP URL injected as env var
  try {
    const sandboxEnvVars: Record<string, string> = {};
    if (cdpWsUrl) {
      sandboxEnvVars.BROWSER_USE_CDP_URL = cdpWsUrl;
    }

    const info = await sandboxManager.createSandbox({
      envVars: sandboxEnvVars,
    });

    session = await db
      .updateTable("sessions")
      .set({
        sandbox_id: info.sandboxId,
        status: "active",
        updated_at: sql`now()`,
      })
      .where("id", "=", session.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Upload skill file to sandbox if skill_id was provided
    if (body.skill_id) {
      try {
        const skill = await db
          .selectFrom("skills")
          .selectAll()
          .where("id", "=", body.skill_id)
          .executeTakeFirst();

        if (skill) {
          await sandboxManager.uploadSkill(
            info.sandboxId,
            skill.filename,
            skill.content,
          );
          log.info(
            { sessionId: session.id, skillId: skill.id, filename: skill.filename },
            "Skill uploaded to sandbox",
          );
        } else {
          log.warn({ skillId: body.skill_id }, "Skill not found, skipping upload");
        }
      } catch (err) {
        log.error({ err, skillId: body.skill_id }, "Failed to upload skill to sandbox");
      }
    }

    log.info(
      {
        sessionId: session.id,
        sandboxId: info.sandboxId,
        browserSessionId,
        hasCdpUrl: !!cdpWsUrl,
      },
      "Session created with sandbox",
    );
  } catch (err) {
    log.error({ err, sessionId: session.id }, "Sandbox creation failed");

    session = await db
      .updateTable("sessions")
      .set({ status: "error", updated_at: sql`now()` })
      .where("id", "=", session.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return c.json(session as any, 201);
  }

  return c.json(session as any, 201);
});

// GET / — List sessions (paginated)
const listSessions = createRoute({
  method: "get",
  path: "/",
  tags: ["Sessions"],
  summary: "List sessions",
  request: {
    query: ListSessionsQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of sessions",
      content: { "application/json": { schema: PaginatedSessionsSchema } },
    },
  },
});

sessionsRouter.openapi(listSessions, async (c) => {
  const { limit, offset, status } = c.req.valid("query");

  let baseQuery = db.selectFrom("sessions");
  if (status) {
    baseQuery = baseQuery.where("status", "=", status);
  }

  const [rows, countResult] = await Promise.all([
    baseQuery
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(sql<number>`count(*)::int`.as("total"))
      .executeTakeFirstOrThrow(),
  ]);

  return c.json(
    { data: rows, total: countResult.total, limit, offset } as any,
    200,
  );
});

// GET /:id — Get session by ID with messages
const getSession = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Sessions"],
  summary: "Get session by ID",
  request: {
    params: SessionSchema.pick({ id: true }),
  },
  responses: {
    200: {
      description: "Session with messages",
      content: { "application/json": { schema: SessionWithMessagesSchema } },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

sessionsRouter.openapi(getSession, async (c) => {
  const { id } = c.req.valid("param");

  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const messages = await db
    .selectFrom("session_messages")
    .selectAll()
    .where("session_id", "=", id)
    .orderBy("created_at", "asc")
    .execute();

  return c.json({ ...session, messages } as any, 200);
});

// POST /:id/messages — Add a message to a session
const createMessage = createRoute({
  method: "post",
  path: "/{id}/messages",
  tags: ["Sessions"],
  summary: "Add a message to a session",
  request: {
    params: SessionSchema.pick({ id: true }),
    body: {
      content: { "application/json": { schema: CreateMessageSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Message created",
      content: { "application/json": { schema: SessionMessageSchema } },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

sessionsRouter.openapi(createMessage, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const session = await db
    .selectFrom("sessions")
    .select("id")
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const message = await db
    .insertInto("session_messages")
    .values({
      session_id: id,
      type: "user",
      content: JSON.stringify({
        role: "user",
        content: [{ type: "text", text: body.content }],
      }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(message as any, 201);
});

// PATCH /:id — Update session
const updateSession = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Sessions"],
  summary: "Update a session",
  request: {
    params: SessionSchema.pick({ id: true }),
    body: {
      content: { "application/json": { schema: UpdateSessionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updated session",
      content: { "application/json": { schema: SessionSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

sessionsRouter.openapi(updateSession, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const updates: Record<string, unknown> = { updated_at: sql`now()` };
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updates[key] =
        key === "config" || key === "sdk_init" || key === "result"
          ? JSON.stringify(value)
          : value;
    }
  }

  const session = await db
    .updateTable("sessions")
    .set(updates)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(session as any, 200);
});

// DELETE /:id — Delete session (cascade removes messages)
const deleteSession = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Sessions"],
  summary: "Delete a session",
  request: {
    params: SessionSchema.pick({ id: true }),
  },
  responses: {
    204: { description: "Session deleted" },
    404: {
      description: "Session not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

sessionsRouter.openapi(deleteSession, async (c) => {
  const { id } = c.req.valid("param");

  // Look up session to get sandbox_id before deleting
  const session = await db
    .selectFrom("sessions")
    .select(["id", "sandbox_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Destroy sandbox if one exists
  if (session.sandbox_id) {
    try {
      await sandboxManager.destroySandbox(session.sandbox_id);
      log.info(
        { sessionId: id, sandboxId: session.sandbox_id },
        "Sandbox destroyed",
      );
    } catch (err) {
      // Sandbox may already be gone — log and continue with deletion
      log.warn(
        { err, sessionId: id, sandboxId: session.sandbox_id },
        "Failed to destroy sandbox (may already be gone)",
      );
    }
  }

  await db.deleteFrom("sessions").where("id", "=", id).executeTakeFirst();

  return c.body(null, 204);
});

// GET /:id/browser-preview — Get browser preview URL
const getBrowserPreview = createRoute({
  method: "get",
  path: "/{id}/browser-preview",
  tags: ["Sessions"],
  summary: "Get browser preview URL for a session",
  request: {
    params: SessionSchema.pick({ id: true }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: BrowserPreviewSchema } },
      description: "Browser preview URL",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Session or browser session not found",
    },
  },
});

sessionsRouter.openapi(getBrowserPreview, async (c) => {
  const { id } = c.req.valid("param");

  const session = await db
    .selectFrom("sessions")
    .select(["browser_session_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (!session.browser_session_id) {
    return c.json(
      { error: "No browser session associated with this session" },
      404,
    );
  }

  const info = await browserUseService.getSessionInfo(
    session.browser_session_id,
  );

  if (!info.liveUrl) {
    return c.json({ error: "Browser session has no live URL" }, 404);
  }

  return c.json({ liveUrl: info.liveUrl }, 200);
});
