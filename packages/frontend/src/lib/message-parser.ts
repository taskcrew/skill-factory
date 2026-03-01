import type {
  ChatSession,
  ChatMessage,
  ToolCall,
  ContentItem,
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKStreamEvent,
} from "../types/chat.ts";

let messageCounter = 0;

function makeId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

function getOrCreateAssistantMessage(session: ChatSession): {
  session: ChatSession;
  message: ChatMessage;
  index: number;
} {
  const messages = [...session.messages];
  const lastMsg = messages[messages.length - 1];

  if (lastMsg && lastMsg.role === "assistant" && lastMsg.isStreaming) {
    return { session: { ...session, messages }, message: lastMsg, index: messages.length - 1 };
  }

  const newMsg: ChatMessage = {
    id: makeId(),
    role: "assistant",
    text: "",
    toolCalls: [],
    contentBlocks: [],
    timestamp: Date.now(),
    isStreaming: true,
  };
  messages.push(newMsg);
  return { session: { ...session, messages }, message: newMsg, index: messages.length - 1 };
}

function handleAssistantMessage(
  session: ChatSession,
  sdk: SDKAssistantMessage
): ChatSession {
  const { session: s, message, index } = getOrCreateAssistantMessage(session);
  const messages = [...s.messages];
  const updated = {
    ...message,
    toolCalls: [...message.toolCalls],
    contentBlocks: [...message.contentBlocks],
  };

  for (const block of sdk.message.content) {
    if (block.type === "text") {
      updated.text += (updated.text ? "\n\n" : "") + block.text;
      updated.contentBlocks.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      const toolCall: ToolCall = {
        id: block.id,
        name: block.name,
        input: block.input,
        status: "running",
        isError: false,
      };
      updated.toolCalls.push(toolCall);
      updated.contentBlocks.push({ type: "tool_call", toolCall });
    }
  }

  messages[index] = updated;
  return { ...s, messages, isAgentRunning: true };
}

function handleUserMessage(
  session: ChatSession,
  sdk: SDKUserMessage
): ChatSession {
  const messages = [...session.messages];

  for (const block of sdk.message.content) {
    if (block.type !== "tool_result") continue;

    // Find the matching tool call across all messages (search backwards)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      if (msg.role !== "assistant") continue;

      const toolIdx = msg.toolCalls.findIndex((tc) => tc.id === block.tool_use_id);
      if (toolIdx === -1) continue;

      const updatedTool: ToolCall = {
        ...msg.toolCalls[toolIdx]!,
        status: block.is_error ? "error" : "completed",
        isError: block.is_error === true,
        result: typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content.map((c) => c.text ?? "").join("\n")
            : undefined,
      };

      const updatedToolCalls = [...msg.toolCalls];
      updatedToolCalls[toolIdx] = updatedTool;
      const updatedContentBlocks = msg.contentBlocks.map((cb): ContentItem =>
        cb.type === "tool_call" && cb.toolCall.id === block.tool_use_id
          ? { type: "tool_call", toolCall: updatedTool }
          : cb
      );
      messages[i] = { ...msg, toolCalls: updatedToolCalls, contentBlocks: updatedContentBlocks };
      break;
    }
  }

  return { ...session, messages };
}

function handleResultMessage(
  session: ChatSession,
  sdk: SDKResultMessage
): ChatSession {
  const messages = session.messages.map((msg) =>
    msg.isStreaming ? { ...msg, isStreaming: false } : msg
  );

  const newState: ChatSession = {
    ...session,
    messages,
    isAgentRunning: false,
  };

  if (sdk.is_error) {
    newState.error = sdk.result ?? "Agent encountered an error";
  }

  return newState;
}

function handleStreamEvent(
  session: ChatSession,
  sdk: SDKStreamEvent
): ChatSession {
  const event = sdk.event;

  // Handle content_block_delta with text_delta for streaming text
  if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
    const { session: s, message, index } = getOrCreateAssistantMessage(session);
    const messages = [...s.messages];
    const contentBlocks = [...message.contentBlocks];
    const lastBlock = contentBlocks[contentBlocks.length - 1];
    if (lastBlock && lastBlock.type === "text") {
      contentBlocks[contentBlocks.length - 1] = {
        type: "text",
        text: lastBlock.text + event.delta.text,
      };
    } else {
      contentBlocks.push({ type: "text", text: event.delta.text });
    }
    messages[index] = {
      ...message,
      text: message.text + event.delta.text,
      contentBlocks,
    };
    return { ...s, messages };
  }

  return session;
}

export function processSDKMessage(
  state: ChatSession,
  message: SDKMessage
): ChatSession {
  switch (message.type) {
    case "assistant":
      return handleAssistantMessage(state, message);
    case "user":
      return handleUserMessage(state, message);
    case "result":
      return handleResultMessage(state, message);
    case "stream_event":
      return handleStreamEvent(state, message);
    case "system":
      return state; // Ignore system messages for now
    default:
      return state;
  }
}
