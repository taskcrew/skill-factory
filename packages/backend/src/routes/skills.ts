import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "kysely";
import { db } from "../db";
import { ErrorSchema } from "../schemas/session";
import {
  CreateSkillSchema,
  ListSkillsQuerySchema,
  PaginatedSkillsSchema,
  SkillSchema,
  UpdateSkillSchema,
} from "../schemas/skill";

export const skillsRouter = new OpenAPIHono();

// POST / — Create a new skill
const createSkill = createRoute({
  method: "post",
  path: "/",
  tags: ["Skills"],
  summary: "Create a new skill",
  request: {
    body: {
      content: { "application/json": { schema: CreateSkillSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Skill created",
      content: { "application/json": { schema: SkillSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

skillsRouter.openapi(createSkill, async (c) => {
  const body = c.req.valid("json");

  const skill = await db
    .insertInto("skills")
    .values({
      name: "browser-recording-replay",
      filename: body.filename,
      content: body.content,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(skill as any, 201);
});

// GET / — List skills (paginated)
const listSkills = createRoute({
  method: "get",
  path: "/",
  tags: ["Skills"],
  summary: "List skills",
  request: {
    query: ListSkillsQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of skills",
      content: { "application/json": { schema: PaginatedSkillsSchema } },
    },
  },
});

skillsRouter.openapi(listSkills, async (c) => {
  const { limit, offset } = c.req.valid("query");

  const [rows, countResult] = await Promise.all([
    db
      .selectFrom("skills")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute(),
    db
      .selectFrom("skills")
      .select(sql<number>`count(*)::int`.as("total"))
      .executeTakeFirstOrThrow(),
  ]);

  return c.json(
    { data: rows, total: countResult.total, limit, offset } as any,
    200,
  );
});

// GET /:id — Get skill by ID
const getSkill = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Skills"],
  summary: "Get skill by ID",
  request: {
    params: SkillSchema.pick({ id: true }),
  },
  responses: {
    200: {
      description: "Skill found",
      content: { "application/json": { schema: SkillSchema } },
    },
    404: {
      description: "Skill not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

skillsRouter.openapi(getSkill, async (c) => {
  const { id } = c.req.valid("param");

  const skill = await db
    .selectFrom("skills")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(skill as any, 200);
});

// PATCH /:id — Update skill
const updateSkill = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Skills"],
  summary: "Update a skill",
  request: {
    params: SkillSchema.pick({ id: true }),
    body: {
      content: { "application/json": { schema: UpdateSkillSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updated skill",
      content: { "application/json": { schema: SkillSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Skill not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

skillsRouter.openapi(updateSkill, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const updates: Record<string, unknown> = { updated_at: sql`now()` };
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const skill = await db
    .updateTable("skills")
    .set(updates)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json(skill as any, 200);
});

// DELETE /:id — Delete skill
const deleteSkill = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Skills"],
  summary: "Delete a skill",
  request: {
    params: SkillSchema.pick({ id: true }),
  },
  responses: {
    204: { description: "Skill deleted" },
    404: {
      description: "Skill not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

skillsRouter.openapi(deleteSkill, async (c) => {
  const { id } = c.req.valid("param");

  const result = await db
    .deleteFrom("skills")
    .where("id", "=", id)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.body(null, 204);
});
