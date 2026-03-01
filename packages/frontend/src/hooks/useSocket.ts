import { useEffect, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useChatContext } from "../context/ChatContext.tsx";
import { useSessionApi } from "./useSessionApi.ts";
import type { SDKMessage, LifecycleEvent } from "../types/chat.ts";

const BACKEND_URL = import.meta.env?.BACKEND_URL ?? "http://localhost:3001";

// ---------- Hook ----------

export interface SocketActions {
  sendMessage: (text: string) => void;
}

export function useSocket(): SocketActions {
  const { state, dispatch } = useChatContext();
  const { createSession } = useSessionApi();
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(state.sessionId);

  // Keep ref in sync with state
  useEffect(() => {
    sessionIdRef.current = state.sessionId;
  }, [state.sessionId]);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      dispatch({ type: "CONNECT" });
      // Rejoin session room on reconnect
      if (sessionIdRef.current) {
        socket.emit("join", { sessionId: sessionIdRef.current });
      }
    });

    socket.on("disconnect", () => dispatch({ type: "DISCONNECT" }));

    socket.on("message", (msg: SDKMessage) =>
      dispatch({ type: "SDK_MESSAGE", payload: msg })
    );

    socket.on("lifecycle", (evt: LifecycleEvent) =>
      dispatch({ type: "LIFECYCLE_EVENT", payload: evt })
    );

    socket.on("error", (payload: { error: string }) =>
      dispatch({ type: "SET_ERROR", error: payload.error })
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dispatch]);

  const sendMessage = useCallback(
    (text: string) => {
      // Optimistic: show user message immediately
      dispatch({ type: "ADD_USER_MESSAGE", text });

      (async () => {
        try {
          let currentSessionId = sessionIdRef.current;

          if (!currentSessionId) {
            // First message — create session (provisions sandbox)
            const sessionName = text.slice(0, 50);
            const session = await createSession(sessionName, text);
            currentSessionId = session.id;
            dispatch({ type: "SET_SESSION_ID", sessionId: session.id });
          }

          // Emit execute via Socket.IO
          socketRef.current?.emit("execute", {
            sessionId: currentSessionId,
            task: text,
          });
        } catch (err) {
          dispatch({
            type: "SET_ERROR",
            error:
              err instanceof Error ? err.message : "Failed to send message",
          });
        }
      })();
    },
    [dispatch, createSession]
  );

  return { sendMessage };
}
