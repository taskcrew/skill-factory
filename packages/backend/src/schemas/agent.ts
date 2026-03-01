import { z } from "@hono/zod-openapi";

const McpServerConfigSchema = z.union([
  z.object({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    appendPrompt: z.string().optional(),
  }),
  z.object({
    type: z.literal("sse"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    appendPrompt: z.string().optional(),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    appendPrompt: z.string().optional(),
  }),
]);

export const AgentQueryRequestSchema = z
  .object({
    task: z.string().min(1),
    model: z.string().optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    mcpServers: z.record(z.string(), McpServerConfigSchema).optional(),
    workspacePath: z.string().optional(),
  })
  .openapi("AgentQueryRequest");

export const AgentExecuteRequestSchema = z
  .object({
    task: z.string().min(1),
    runId: z.string().optional(),
    sessionId: z.string().optional(),
    model: z.string().optional(),
    memory: z.string().optional(),
    mcpServers: z.record(z.string(), McpServerConfigSchema).optional(),
    maxTurns: z.number().int().positive().optional(),
    timeout: z.number().int().positive().optional(),
    disallowedTools: z.array(z.string()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    workspacePath: z.string().optional(),
  })
  .openapi("AgentExecuteRequest");

export const AgentQueryResultSchema = z
  .object({
    messages: z.array(z.record(z.string(), z.unknown())),
    result: z.string().nullable(),
    structuredOutput: z.unknown().optional(),
  })
  .openapi("AgentQueryResult");
