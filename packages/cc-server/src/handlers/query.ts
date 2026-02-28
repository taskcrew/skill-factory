import {
  query,
  type McpServerConfig as SdkMcpServerConfig,
  type SDKMessage,
} from "@anthropic-ai/claude-code";
import type { Context } from "hono";
import { z } from "zod";

import type { QueryRequest, McpServerConfig } from "../shared/types";
import type { AppEnv } from "../types/hono-env";

const QueryRequestSchema = z.object({
  task: z.string().trim().min(1, "task is required"),
  model: z.string().min(1).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  mcpServers: z
    .record(
      z.string(),
      z.union([
        z.object({
          type: z.literal("stdio"),
          command: z.string().min(1),
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
      ]),
    )
    .optional(),
  workspacePath: z.string().min(1).optional(),
});

function toSdkMcpServerConfig(config: McpServerConfig): SdkMcpServerConfig {
  if (config.type === "stdio") {
    return {
      type: "stdio",
      command: config.command,
      args: config.args,
      env: config.env,
    };
  }

  if (config.type === "sse") {
    return {
      type: "sse",
      url: config.url,
      headers: config.headers,
    };
  }

  return {
    type: "http",
    url: config.url,
    headers: config.headers,
  };
}

function buildSdkMcpServers(
  mcpServers?: Record<string, McpServerConfig>,
): Record<string, SdkMcpServerConfig> | undefined {
  if (!mcpServers) {
    return undefined;
  }

  const entries = Object.entries(mcpServers).map(([name, server]) => [name, toSdkMcpServerConfig(server)]);
  return Object.fromEntries(entries);
}

function buildStructuredOutputPrompt(outputSchema?: Record<string, unknown>): string | undefined {
  if (!outputSchema) {
    return undefined;
  }

  return [
    "Return only valid JSON that follows this schema.",
    "Do not include markdown fences or extra text.",
    JSON.stringify(outputSchema),
  ].join("\n\n");
}

function isSuccessResultMessage(
  message: SDKMessage,
): message is Extract<SDKMessage, { type: "result"; subtype: "success" }> {
  return message.type === "result" && message.subtype === "success";
}

function getResultText(messages: SDKMessage[]): string | null {
  for (const message of [...messages].reverse()) {
    if (isSuccessResultMessage(message)) {
      return message.result;
    }
  }

  return null;
}

export function queryHandler() {
  return async (c: Context<AppEnv>) => {
    let rawBody: QueryRequest;

    try {
      rawBody = await c.req.json<QueryRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = QueryRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: z.flattenError(parsed.error) }, 400);
    }

    const body = parsed.data;
    const structuredOutputPrompt = buildStructuredOutputPrompt(body.outputSchema);
    const messages: SDKMessage[] = [];
    const stream = query({
      prompt: body.task,
      options: {
        cwd: body.workspacePath ?? "/workspace",
        mcpServers: buildSdkMcpServers(body.mcpServers),
        model: body.model,
        permissionMode: "bypassPermissions",
        ...(structuredOutputPrompt ? { appendSystemPrompt: structuredOutputPrompt } : {}),
      },
    });

    for await (const message of stream) {
      messages.push(message);
    }

    const result = getResultText(messages);
    let structuredOutput: unknown;

    if (body.outputSchema && typeof result === "string" && result.trim()) {
      try {
        structuredOutput = JSON.parse(result);
      } catch {
        structuredOutput = null;
      }
    }

    return c.json({
      messages,
      result,
      ...(body.outputSchema ? { structuredOutput } : {}),
    });
  };
}
