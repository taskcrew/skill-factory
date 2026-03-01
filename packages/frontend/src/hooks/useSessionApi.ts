import { useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BACKEND_URL } from "../config";

interface SessionResponse {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionMessageResponse {
  id: string;
  type: string;
  content: Record<string, unknown>;
  created_at: string;
}

interface SessionWithMessages extends SessionResponse {
  messages: SessionMessageResponse[];
}

export function useSessionApi() {
  const queryClient = useQueryClient();
  const inflightRef = useRef<Promise<SessionResponse> | null>(null);

  const createSession = useCallback(
    async (name: string, initialMessage: string): Promise<SessionResponse> => {
      // Deduplicate concurrent calls (e.g. double-click)
      if (inflightRef.current) return inflightRef.current;

      const promise = (async () => {
        const res = await fetch(`${BACKEND_URL}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, initial_message: initialMessage }),
        });
        if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
        return res.json() as Promise<SessionResponse>;
      })();

      inflightRef.current = promise;
      try {
        const session = await promise;
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
        return session;
      } finally {
        inflightRef.current = null;
      }
    },
    [queryClient]
  );

  const postMessage = useCallback(
    async (
      sessionId: string,
      content: string
    ): Promise<SessionMessageResponse> => {
      const res = await fetch(
        `${BACKEND_URL}/api/sessions/${sessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) throw new Error(`Failed to post message: ${res.status}`);
      return res.json() as Promise<SessionMessageResponse>;
    },
    []
  );

  const fetchSession = useCallback(
    async (sessionId: string): Promise<SessionWithMessages> => {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
      return res.json() as Promise<SessionWithMessages>;
    },
    []
  );

  return { createSession, postMessage, fetchSession };
}
