import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  ChatSession,
  ChatMessage,
  SDKMessage,
  LifecycleEvent,
} from "../types/chat.ts";
import { processSDKMessage } from "../lib/message-parser.ts";

// Actions

export type ChatAction =
  | { type: "CONNECT" }
  | { type: "DISCONNECT" }
  | { type: "ADD_USER_MESSAGE"; text: string }
  | { type: "SDK_MESSAGE"; payload: SDKMessage }
  | { type: "LIFECYCLE_EVENT"; payload: LifecycleEvent }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "LOAD_SESSION"; sessionId: string; messages: ChatMessage[] }
  | { type: "CLEAR_SESSION" };

// Reducer

let msgCounter = 0;

const emptyState: ChatSession = {
  sessionId: null,
  messages: [],
  isConnected: false,
  isAgentRunning: false,
};

function chatReducer(state: ChatSession, action: ChatAction): ChatSession {
  switch (action.type) {
    case "CONNECT":
      return { ...state, isConnected: true, error: undefined };

    case "DISCONNECT":
      return { ...state, isConnected: false, isAgentRunning: false };

    case "ADD_USER_MESSAGE": {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}-${++msgCounter}`,
        role: "user",
        text: action.text,
        toolCalls: [],
        timestamp: Date.now(),
        isStreaming: false,
      };
      return {
        ...state,
        messages: [...state.messages, userMsg],
        isAgentRunning: true,
        error: undefined,
      };
    }

    case "SDK_MESSAGE":
      return processSDKMessage(state, action.payload);

    case "LIFECYCLE_EVENT": {
      const evt = action.payload;
      switch (evt.type) {
        case "session_started":
          return { ...state, isAgentRunning: true };
        case "session_completed":
          return {
            ...state,
            isAgentRunning: false,
            messages: state.messages.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            ),
          };
        case "session_error":
          return {
            ...state,
            isAgentRunning: false,
            error: evt.error ?? "Session error",
            messages: state.messages.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            ),
          };
        default:
          return state;
      }
    }

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.sessionId };

    case "LOAD_SESSION":
      return {
        ...emptyState,
        isConnected: state.isConnected,
        sessionId: action.sessionId,
        messages: action.messages,
      };

    case "CLEAR_SESSION":
      return {
        ...emptyState,
        isConnected: state.isConnected,
      };

    default:
      return state;
  }
}

// Context

interface ChatContextValue {
  state: ChatSession;
  dispatch: Dispatch<ChatAction>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, emptyState);

  return (
    <ChatContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
