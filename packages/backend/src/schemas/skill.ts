import { z } from "@hono/zod-openapi";

export const SkillSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    filename: z.string(),
    content: z.string(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi("Skill");

export const CreateSkillSchema = z
  .object({
    name: z.string().min(1),
    filename: z.string().min(1),
    content: z.string().min(1),
  })
  .openapi("CreateSkill");

export const UpdateSkillSchema = z
  .object({
    name: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
  })
  .openapi("UpdateSkill");

export const ListSkillsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const PaginatedSkillsSchema = z
  .object({
    data: z.array(SkillSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .openapi("PaginatedSkills");
