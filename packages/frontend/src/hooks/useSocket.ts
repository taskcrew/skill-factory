import { useEffect, useCallback, useRef } from "react";
import { useChatContext, type ChatAction } from "../context/ChatContext.tsx";
import { useSessionApi } from "./useSessionApi.ts";
import type { SDKMessage, LifecycleEvent } from "../types/chat.ts";

const USE_MOCK = true; // flip to false when backend Socket.IO is ready

// ---------- Mock demo sequence ----------

function fireMockSequence(
  dispatch: React.Dispatch<ChatAction>,
  sessionId: string
) {
  const timers: ReturnType<typeof setTimeout>[] = [];

  function at(ms: number, fn: () => void) {
    timers.push(setTimeout(fn, ms));
  }

  const sdkMsg = (payload: SDKMessage) =>
    dispatch({ type: "SDK_MESSAGE", payload });
  const lifecycle = (payload: LifecycleEvent) =>
    dispatch({ type: "LIFECYCLE_EVENT", payload });

  // 1. Session started
  at(300, () =>
    lifecycle({
      type: "session_started",
      sessionId,
      timestamp: new Date().toISOString(),
    })
  );

  // 2. Assistant text
  at(600, () =>
    sdkMsg({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Let me help you with that. I'll start by examining the project structure.",
          },
        ],
      },
    })
  );

  // 3. Tool use — Bash
  at(1200, () =>
    sdkMsg({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_1",
            name: "Bash",
            input: { command: "ls -la src/" },
          },
        ],
      },
    })
  );

  // 4. Tool result
  at(2200, () =>
    sdkMsg({
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_1",
            content: `total 32
drwxr-xr-x  8 user staff  256 Feb 28 10:00 .
drwxr-xr-x  5 user staff  160 Feb 28 09:00 ..
-rw-r--r--  1 user staff  420 Feb 28 10:00 App.tsx
-rw-r--r--  1 user staff  180 Feb 28 09:30 index.css
-rw-r--r--  1 user staff  350 Feb 28 09:00 index.html
-rw-r--r--  1 user staff  280 Feb 28 09:00 index.ts
drwxr-xr-x  4 user staff  128 Feb 28 10:00 components
drwxr-xr-x  3 user staff   96 Feb 28 10:00 types`,
          },
        ],
      },
    })
  );

  // 5. Assistant analysis text
  at(2800, () =>
    sdkMsg({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I can see the project structure. Let me read the main application file to understand the current setup.",
          },
        ],
      },
    })
  );

  // 6. Tool use — Read
  at(3200, () =>
    sdkMsg({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_2",
            name: "Read",
            input: { file_path: "src/App.tsx" },
          },
        ],
      },
    })
  );

  // 7. Tool result — file content
  at(4000, () =>
    sdkMsg({
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_2",
            content: `import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <div>
      <h1>Skill Factory</h1>
      <p>Welcome to Skill Factory.</p>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);`,
          },
        ],
      },
    })
  );

  // 8. Assistant final summary
  at(4800, () =>
    sdkMsg({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Here's what I found:

**Project structure** looks clean with a standard React setup:
- \`App.tsx\` — Root component rendering a simple welcome page
- \`index.ts\` — Bun.serve entry point with HMR
- \`components/\` and \`types/\` directories are set up

The app uses **React 19** with Bun's HTML imports. Here's the current component hierarchy:

\`\`\`typescript
// App.tsx — Current minimal setup
function App() {
  return (
    <div>
      <h1>Skill Factory</h1>
    </div>
  );
}
\`\`\`

I can help you extend this with additional features. What would you like to build next?`,
          },
        ],
      },
    })
  );

  // 9. Result
  at(5500, () =>
    sdkMsg({
      type: "result",
      session_id: sessionId,
      subtype: "success",
      is_error: false,
      result: "Task completed successfully",
      duration_ms: 5200,
      num_turns: 4,
    })
  );

  // 10. Session completed
  at(5600, () =>
    lifecycle({
      type: "session_completed",
      sessionId,
      timestamp: new Date().toISOString(),
    })
  );

  return () => timers.forEach(clearTimeout);
}

// ---------- Hook ----------

export interface SocketActions {
  sendMessage: (text: string) => void;
}

export function useSocket(): SocketActions {
  const { state, dispatch } = useChatContext();
  const { createSession, postMessage } = useSessionApi();
  const cleanupRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(state.sessionId);

  // Keep ref in sync with state
  useEffect(() => {
    sessionIdRef.current = state.sessionId;
  }, [state.sessionId]);

  useEffect(() => {
    if (USE_MOCK) {
      dispatch({ type: "CONNECT" });
      return () => {
        cleanupRef.current?.();
        dispatch({ type: "DISCONNECT" });
      };
    }

    // Real Socket.IO connection (for when backend is ready)
    let socket: import("socket.io-client").Socket | null = null;

    (async () => {
      const { io } = await import("socket.io-client");
      const { BACKEND_URL } = await import("../config");
      socket = io(BACKEND_URL, {
        query: { sessionId: sessionIdRef.current },
      });

      socket.on("connect", () => dispatch({ type: "CONNECT" }));
      socket.on("disconnect", () => dispatch({ type: "DISCONNECT" }));
      socket.on("message", (msg: SDKMessage) =>
        dispatch({ type: "SDK_MESSAGE", payload: msg })
      );
      socket.on("lifecycle", (evt: LifecycleEvent) =>
        dispatch({ type: "LIFECYCLE_EVENT", payload: evt })
      );
    })();

    return () => {
      socket?.disconnect();
    };
  }, [dispatch]);

  const sendMessage = useCallback(
    (text: string) => {
      // Optimistic: show user message immediately
      dispatch({ type: "ADD_USER_MESSAGE", text });

      // Fire API call + mock sequence asynchronously
      (async () => {
        try {
          let currentSessionId = sessionIdRef.current;

          if (!currentSessionId) {
            // First message — create session with initial message
            const sessionName = text.slice(0, 50);
            const session = await createSession(sessionName, text);
            currentSessionId = session.id;
            dispatch({ type: "SET_SESSION_ID", sessionId: session.id });
          } else {
            // Subsequent message — post to existing session
            await postMessage(currentSessionId, text);
          }

          if (USE_MOCK) {
            cleanupRef.current?.();
            cleanupRef.current = fireMockSequence(dispatch, currentSessionId);
          }
        } catch (err) {
          dispatch({
            type: "SET_ERROR",
            error:
              err instanceof Error ? err.message : "Failed to send message",
          });
        }
      })();
    },
    [dispatch, createSession, postMessage]
  );

  return { sendMessage };
}
