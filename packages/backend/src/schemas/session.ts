import { z } from "@hono/zod-openapi";

const sessionStatuses = ["created", "active", "completed", "error"] as const;

export const SessionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    claude_session_id: z.string().nullable(),
    status: z.enum(sessionStatuses),
    config: z.record(z.string(), z.unknown()),
    browser_session_id: z.string().nullable(),
    sandbox_id: z.string().nullable(),
    sdk_init: z.record(z.string(), z.unknown()).nullable(),
    result: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi("Session");

export const SessionMessageSchema = z
  .object({
    id: z.string().uuid(),
    sdk_message_id: z.string().uuid().nullable(),
    type: z.string(),
    subtype: z.string().nullable(),
    parent_tool_use_id: z.string().nullable(),
    content: z.record(z.string(), z.unknown()),
    created_at: z.string().datetime(),
  })
  .openapi("SessionMessage");

export const SessionWithMessagesSchema = SessionSchema.extend({
  messages: z.array(SessionMessageSchema),
}).openapi("SessionWithMessages");

export const CreateSessionSchema = z
  .object({
    name: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional().default({}),
    browser_session_id: z.string().optional(),
    sandbox_id: z.string().optional(),
  })
  .openapi("CreateSession");

export const UpdateSessionSchema = z
  .object({
    name: z.string().min(1).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(sessionStatuses).optional(),
    claude_session_id: z.string().optional(),
    browser_session_id: z.string().nullable().optional(),
    sandbox_id: z.string().nullable().optional(),
    sdk_init: z.record(z.string(), z.unknown()).nullable().optional(),
    result: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("UpdateSession");

export const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(sessionStatuses).optional(),
});

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export const PaginatedSessionsSchema = z
  .object({
    data: z.array(SessionSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .openapi("PaginatedSessions");

export const BrowserPreviewSchema = z
  .object({
    liveUrl: z.string().url(),
  })
  .openapi("BrowserPreview");
