import { useQuery } from "@tanstack/react-query";
import type { PaginatedSessions } from "../types/chat";
import { BACKEND_URL } from "../config";

async function fetchSessions(): Promise<PaginatedSessions> {
  const res = await fetch(`${BACKEND_URL}/api/sessions?limit=50`);
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
