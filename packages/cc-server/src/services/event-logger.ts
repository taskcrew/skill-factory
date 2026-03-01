import type { SDKMessage } from "@anthropic-ai/claude-code";
import type { Logger } from "pino";

const toolUseNameById = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseAndLogMessage(message: SDKMessage, logger: Logger): void {
  switch (message.type) {
    case "assistant": {
      const content = message.message.content;
      if (!Array.isArray(content)) {
        break;
      }

      for (const block of content) {
        if (!isRecord(block)) {
          continue;
        }

        if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
          toolUseNameById.set(block.id, block.name);
          logger.info(
            {
              toolName: block.name,
              toolUseId: block.id,
            },
            "Tool use started",
          );
        }
      }

      break;
    }

    case "user": {
      const content = message.message.content;
      if (!Array.isArray(content)) {
        break;
      }

      for (const block of content) {
        if (!isRecord(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string") {
          continue;
        }

        const toolName = toolUseNameById.get(block.tool_use_id);
        const isError = block.is_error === true;
        const log = isError ? logger.warn.bind(logger) : logger.info.bind(logger);

        log(
          {
            toolUseId: block.tool_use_id,
            toolName,
            hasToolName: Boolean(toolName),
          },
          isError ? "Tool use failed" : "Tool use completed",
        );
      }

      break;
    }

    case "result": {
      const usage = message.usage as Record<string, unknown>;
      const inputTokens = getNumber(usage.input_tokens) ?? 0;
      const outputTokens = getNumber(usage.output_tokens) ?? 0;
      const cacheCreationInputTokens = getNumber(usage.cache_creation_input_tokens) ?? 0;
      const cacheReadInputTokens = getNumber(usage.cache_read_input_tokens) ?? 0;
      const totalTokens = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens;
      const contextPercent = (totalTokens / 200_000) * 100;

      logger.info(
        {
          subtype: message.subtype,
          isError: message.is_error,
          usage: {
            inputTokens,
            outputTokens,
            cacheCreationInputTokens,
            cacheReadInputTokens,
            totalTokens,
            contextPercent,
          },
        },
        "Execution result",
      );
      break;
    }

    default:
      break;
  }
}
