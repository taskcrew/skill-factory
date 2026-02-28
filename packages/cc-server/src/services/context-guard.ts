import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-code";

export type UsageSnapshot = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;

export class ContextGuard {
  private usage: Required<UsageSnapshot> = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  constructor(private readonly maxMcpOutputTokens: number) {}

  updateUsage(usage: UsageSnapshot): void {
    this.usage = {
      input_tokens: usage.input_tokens ?? this.usage.input_tokens,
      output_tokens: usage.output_tokens ?? this.usage.output_tokens,
      cache_creation_input_tokens:
        usage.cache_creation_input_tokens ?? this.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        usage.cache_read_input_tokens ?? this.usage.cache_read_input_tokens,
    };
  }

  getHeadroomTokens(): number {
    const usedTokens =
      this.usage.input_tokens +
      this.usage.output_tokens +
      this.usage.cache_creation_input_tokens +
      this.usage.cache_read_input_tokens;

    return DEFAULT_CONTEXT_WINDOW_TOKENS - usedTokens;
  }

  createPreToolUseHook(): HookCallback {
    return async (input): Promise<HookJSONOutput> => {
      if (input.hook_event_name !== "PreToolUse") {
        return { continue: true };
      }

      const isMcpTool = input.tool_name.startsWith("mcp__");
      if (!isMcpTool) {
        return { continue: true };
      }

      const headroom = this.getHeadroomTokens();
      if (headroom >= this.maxMcpOutputTokens) {
        return { continue: true };
      }

      return {
        continue: true,
        decision: "block",
        reason: `Blocking MCP tool: context headroom is too low (${headroom} remaining, threshold ${this.maxMcpOutputTokens}).`,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Context headroom below MCP safety threshold.",
        },
      };
    };
  }
}
