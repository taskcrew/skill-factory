import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.BACKEND_URL ?? "http://localhost:3001";

interface BrowserPreview {
  liveUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useBrowserPreview(sessionId: string | null): BrowserPreview {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}/browser-preview`);
      if (!res.ok) {
        if (res.status === 404) {
          setLiveUrl(null);
          return;
        }
        throw new Error(`Failed to fetch browser preview: ${res.status}`);
      }
      const data = (await res.json()) as { liveUrl: string };
      setLiveUrl(data.liveUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLiveUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setLiveUrl(null);
      return;
    }

    fetchPreview(sessionId);

    // Poll every 5s while we don't have a liveUrl
    const interval = setInterval(() => {
      if (!liveUrl) {
        fetchPreview(sessionId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, fetchPreview, liveUrl]);

  return { liveUrl, isLoading, error };
}
