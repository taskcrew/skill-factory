// SDK message types — subset of @anthropic-ai/claude-code SDK types
// We define these locally to avoid pulling in the full SDK as a dependency

export type SDKMessageBase = {
  uuid?: string;
  session_id: string;
};

/** Anthropic API content block types */
export type TextBlock = {
  type: "text";
  text: string;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
};

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type SDKAssistantMessage = SDKMessageBase & {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
};

export type SDKUserMessage = SDKMessageBase & {
  type: "user";
  message: {
    role: "user";
    content: ContentBlock[];
  };
};

export type SDKResultMessage = SDKMessageBase & {
  type: "result";
  subtype: "success" | "error_max_turns" | "error_during_execution";
  is_error: boolean;
  result?: string;
  duration_ms?: number;
  num_turns?: number;
};

export type SDKStreamEvent = SDKMessageBase & {
  type: "stream_event";
  event: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;
    };
    content_block?: {
      type: string;
      text?: string;
    };
  };
};

export type SDKSystemMessage = SDKMessageBase & {
  type: "system";
  subtype: "init" | "compact_boundary";
};

export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | SDKStreamEvent
  | SDKSystemMessage;

// Lifecycle events from cc-server
export type LifecycleEventType =
  | "session_started"
  | "session_completed"
  | "session_error";

export type LifecycleEvent = {
  type: LifecycleEventType;
  runId?: string;
  sessionId?: string;
  timestamp: string;
  error?: string;
};

// API types

export type SessionStatus = "created" | "active" | "completed" | "error";

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginatedSessions {
  data: Session[];
  total: number;
  limit: number;
  offset: number;
}

// Chat UI types

export type ToolCallStatus = "running" | "completed" | "error";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  status: ToolCallStatus;
  result?: unknown;
  isError: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  toolCalls: ToolCall[];
  timestamp: number;
  isStreaming: boolean;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  isConnected: boolean;
  isAgentRunning: boolean;
  error?: string;
}
