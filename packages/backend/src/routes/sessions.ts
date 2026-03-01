import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "kysely";
import { db } from "../db";
import {
  BrowserPreviewSchema,
  CreateSessionSchema,
  ErrorSchema,
  ListSessionsQuerySchema,
  PaginatedSessionsSchema,
  SessionSchema,
  SessionWithMessagesSchema,
  UpdateSessionSchema,
} from "../schemas/session";
import { BrowserUseService } from "../services/browser-use";

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

  const session = await db
    .insertInto("sessions")
    .values({
      name: body.name,
      config: JSON.stringify(body.config),
      browser_session_id: body.browser_session_id ?? null,
      sandbox_id: body.sandbox_id ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

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

  const result = await db
    .deleteFrom("sessions")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    return c.json({ error: "Session not found" }, 404);
  }

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
