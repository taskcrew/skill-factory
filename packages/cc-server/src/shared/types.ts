export type StdioMcpServerConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  appendPrompt?: string;
};

export type SseMcpServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
  appendPrompt?: string;
};

export type HttpMcpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  appendPrompt?: string;
};

export type McpServerConfig = StdioMcpServerConfig | SseMcpServerConfig | HttpMcpServerConfig;

export type ExecuteRequest = {
  task: string;
  runId?: string;
  sessionId?: string;
  mcpServers?: Record<string, McpServerConfig>;
  model?: string;
  memory?: string;
  maxTurns?: number;
  timeout?: number;
  disallowedTools?: string[];
  outputSchema?: Record<string, unknown>;
};

export type QueryRequest = {
  task: string;
  model?: string;
  outputSchema?: Record<string, unknown>;
  mcpServers?: Record<string, McpServerConfig>;
  workspacePath?: string;
};

export type LifecycleEventType = "session_started" | "session_completed" | "session_error";

export type LifecycleEvent = {
  type: LifecycleEventType;
  runId?: string;
  sessionId?: string;
  timestamp: string;
  error?: string;
};

export type SseEventType = "lifecycle" | "message" | "error";
