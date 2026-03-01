import { useQuery } from "@tanstack/react-query";
import type { PaginatedSessions } from "../types/chat";

const API_BASE = process.env.BACKEND_URL ?? "http://localhost:3001";

async function fetchSessions(): Promise<PaginatedSessions> {
  const res = await fetch(`${API_BASE}/api/sessions?limit=50`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`);
  }
  return res.json();
}

export function useSessions() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
    refetchOnWindowFocus: false,
  });

  return {
    sessions: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
