import {
  query,
  type HookCallbackMatcher,
  type HookEvent,
  type McpServerConfig as SdkMcpServerConfig,
  type SDKMessage,
} from "@anthropic-ai/claude-code";
import { EventEmitter } from "node:events";

import { config } from "../config";
import { logger } from "../config/logger";
import type { ExecuteRequest, LifecycleEvent, McpServerConfig } from "../shared/types";
import { ContextGuard, type UsageSnapshot } from "./context-guard";
import { parseAndLogMessage } from "./event-logger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUsageFromUnknown(value: unknown): UsageSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const usage: UsageSnapshot = {
    input_tokens: typeof value.input_tokens === "number" ? value.input_tokens : undefined,
    output_tokens: typeof value.output_tokens === "number" ? value.output_tokens : undefined,
    cache_creation_input_tokens:
      typeof value.cache_creation_input_tokens === "number"
        ? value.cache_creation_input_tokens
        : undefined,
    cache_read_input_tokens:
      typeof value.cache_read_input_tokens === "number" ? value.cache_read_input_tokens : undefined,
  };

  if (
    usage.input_tokens === undefined &&
    usage.output_tokens === undefined &&
    usage.cache_creation_input_tokens === undefined &&
    usage.cache_read_input_tokens === undefined
  ) {
    return null;
  }

  return usage;
}

function extractUsageSnapshot(message: SDKMessage): UsageSnapshot | null {
  if (message.type === "result") {
    return getUsageFromUnknown(message.usage);
  }

  if (message.type !== "stream_event") {
    return null;
  }

  const event = message.event;
  if (!isRecord(event)) {
    return null;
  }

  if (event.type === "message_start" && isRecord(event.message)) {
    return getUsageFromUnknown(event.message.usage);
  }

  if (event.type === "message_delta") {
    return getUsageFromUnknown(event.usage);
  }

  return null;
}

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

function buildMcpPromptAppendix(mcpServers?: Record<string, McpServerConfig>): string {
  if (!mcpServers) {
    return "";
  }

  const appendPrompts = Object.values(mcpServers)
    .map((server) => server.appendPrompt?.trim())
    .filter((prompt): prompt is string => Boolean(prompt));

  return appendPrompts.join("\n\n");
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

export class StreamingClaudeExecutor extends EventEmitter {
  readonly activeQueries = new Map<string, AbortController>();

  constructor(
    private readonly serviceLogger = logger,
    private readonly maxMcpOutputTokens = config.execution.maxMcpOutputTokens,
    private readonly defaultCwd = "/workspace",
  ) {
    super();
  }

  async *executeTaskIterator(request: ExecuteRequest): AsyncGenerator<SDKMessage, void> {
    const runId = request.runId ?? crypto.randomUUID();
    const log = this.serviceLogger.child({ runId });
    const guard = new ContextGuard(this.maxMcpOutputTokens);
    const abortController = new AbortController();
    const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
      PreToolUse: [{ hooks: [guard.createPreToolUseHook()] }],
    };

    const promptAppendix = buildMcpPromptAppendix(request.mcpServers);
    const customSystemPrompt = [request.memory?.trim(), promptAppendix]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");

    const mcpServers = buildSdkMcpServers(request.mcpServers);
    const lifecycleStarted: LifecycleEvent = {
      type: "session_started",
      runId,
      timestamp: new Date().toISOString(),
    };

    this.activeQueries.set(runId, abortController);
    this.emit("lifecycle", lifecycleStarted);

    const timeout =
      typeof request.timeout === "number" && request.timeout > 0
        ? setTimeout(() => {
            abortController.abort(`Execution timed out after ${request.timeout}ms`);
          }, request.timeout)
        : undefined;

    let sessionId: string | undefined;

    try {
      const stream = query({
        prompt: request.task,
        options: {
          abortController,
          cwd: this.defaultCwd,
          disallowedTools: request.disallowedTools,
          hooks,
          maxTurns: request.maxTurns,
          mcpServers,
          model: request.model,
          permissionMode: "bypassPermissions",
          resume: request.sessionId,
          ...(customSystemPrompt ? { customSystemPrompt } : {}),
        },
      });

      for await (const message of stream) {
        sessionId = sessionId ?? message.session_id;

        parseAndLogMessage(message, log);

        const usageSnapshot = extractUsageSnapshot(message);
        if (usageSnapshot) {
          guard.updateUsage(usageSnapshot);
        }

        yield message;
      }

      this.emit("lifecycle", {
        type: "session_completed",
        runId,
        sessionId,
        timestamp: new Date().toISOString(),
      } satisfies LifecycleEvent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit("lifecycle", {
        type: "session_error",
        runId,
        sessionId,
        timestamp: new Date().toISOString(),
        error: errorMessage,
      } satisfies LifecycleEvent);

      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }

      this.activeQueries.delete(runId);
    }
  }
}
