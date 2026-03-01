import { useSessions } from "../hooks/useSessions";
import { useSessionApi } from "../hooks/useSessionApi";
import { useChatContext } from "../context/ChatContext";
import type { ChatMessage, Session, SessionStatus } from "../types/chat";

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

const statusColors: Record<SessionStatus, string> = {
  created: "bg-info",
  active: "bg-success",
  completed: "bg-base-content/30",
  error: "bg-error",
};

/** Convert backend session_messages rows to ChatMessage[] */
function convertBackendMessages(
  messages: Array<{
    id: string;
    type: string;
    content: Record<string, unknown>;
    created_at: string;
  }>
): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.type === "user") {
      const content = msg.content as {
        role: string;
        message?: { role: string; content: Array<{
          type: string;
          text?: string;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }> };
        content: Array<{
          type: string;
          text?: string;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }>;
      };
      const blocks = content.message?.content ?? content.content ?? [];

      // Plain text user messages
      const textParts = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "");
      if (textParts.length > 0 && textParts.some((t) => t.trim())) {
        result.push({
          id: msg.id,
          role: "user",
          text: textParts.join(""),
          toolCalls: [],
          contentBlocks: [],
          timestamp: new Date(msg.created_at).getTime(),
          isStreaming: false,
        });
      }

      // tool_result blocks — attach to preceding assistant's tool calls
      for (const block of blocks) {
        if (block.type !== "tool_result") continue;
        for (let i = result.length - 1; i >= 0; i--) {
          const prev = result[i]!;
          if (prev.role !== "assistant") continue;
          const tc = prev.toolCalls.find(
            (tc) => tc.id === block.tool_use_id
          );
          if (!tc) continue;
          tc.status = block.is_error ? "error" : "completed";
          tc.isError = block.is_error === true;
          tc.result =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as Array<{ text?: string }>)
                    .map((c) => c.text ?? "")
                    .join("\n")
                : undefined;
          break;
        }
      }
    }

    if (msg.type === "assistant") {
      const content = msg.content as {
        type: "assistant";
        message?: {
          role: "assistant";
          content: Array<{
            type: string;
            text?: string;
            id?: string;
            name?: string;
            input?: unknown;
          }>;
        };
        content?: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
      };
      const blocks = content.message?.content ?? content.content ?? [];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n\n");
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id!,
          name: b.name!,
          input: b.input,
          status: "completed" as const,
          isError: false,
        }));
      if (text || toolCalls.length > 0) {
        result.push({
          id: msg.id,
          role: "assistant",
          text,
          toolCalls,
          timestamp: new Date(msg.created_at).getTime(),
          isStreaming: false,
        });
      }
    }
  }
  return result;
}

function SessionItem({
  session,
  isActive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
        isActive ? "bg-base-300" : "hover:bg-base-200"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${statusColors[session.status]}`}
          title={session.status}
        />
        <span className="truncate text-sm font-medium">{session.name}</span>
      </div>
      <div className="text-xs text-base-content/50 mt-0.5 pl-4">
        {formatRelativeTime(session.created_at)}
      </div>
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2 px-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5 py-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SessionSidebar() {
  const { sessions, isLoading, error } = useSessions();
  const { state, dispatch } = useChatContext();
  const { fetchSession } = useSessionApi();

  const handleSessionClick = async (sessionId: string) => {
    if (sessionId === state.sessionId) return;
    try {
      const session = await fetchSession(sessionId);
      const messages = convertBackendMessages(session.messages);
      dispatch({ type: "LOAD_SESSION", sessionId: session.id, messages });
    } catch {
      dispatch({ type: "SET_ERROR", error: "Failed to load session" });
    }
  };

  const handleNewChat = () => {
    dispatch({ type: "CLEAR_SESSION" });
  };

  return (
    <div className="w-72 h-full bg-base-100 border-r border-base-content/10 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10">
        <h2 className="font-semibold text-sm">Sessions</h2>
        <button className="btn btn-xs btn-primary" onClick={handleNewChat}>
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1">
        {isLoading && <SkeletonList />}

        {error && (
          <div className="px-3 py-4 text-sm text-base-content/50 text-center">
            Could not load sessions
          </div>
        )}

        {!isLoading && !error && sessions.length === 0 && (
          <div className="px-3 py-4 text-sm text-base-content/50 text-center">
            No sessions yet
          </div>
        )}

        {!isLoading &&
          !error &&
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === state.sessionId}
              onClick={() => handleSessionClick(session.id)}
            />
          ))}
      </div>
    </div>
  );
}
