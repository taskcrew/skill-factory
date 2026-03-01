import { config } from "../config";
import { logger } from "../logger";

const BASE_URL = "https://api.browser-use.com/api/v2";

export type BrowserSession = {
  id: string;
  status: string;
};

export type BrowserSessionInfo = {
  id: string;
  status: string;
  cdpWsUrl: string | null;
  liveUrl: string | null;
  timeoutAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export class BrowserUseService {
  private readonly log = logger.child({ service: "browser-use" });

  private async apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-Browser-Use-API-Key": config.browserUse.apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Browser Use API error: ${res.status} ${res.statusText} — ${body}`,
      );
    }

    return res;
  }

  async createSession(): Promise<BrowserSession> {
    this.log.info("Creating browser session");

    const res = await this.apiFetch("/browsers", { method: "POST" });
    const data = (await res.json()) as { id: string; status: string };

    this.log.info({ sessionId: data.id, status: data.status }, "Browser session created");

    return { id: data.id, status: data.status };
  }

  async getSessionInfo(id: string): Promise<BrowserSessionInfo> {
    this.log.debug({ sessionId: id }, "Fetching browser session info");

    const res = await this.apiFetch(`/browsers/${id}`);
    const data = (await res.json()) as {
      id: string;
      status: string;
      cdp_url?: string;
      live_url?: string;
      timeout_at?: string;
      started_at?: string;
      finished_at?: string;
    };

    let cdpWsUrl: string | null = null;
    if (data.cdp_url) {
      try {
        const cdpRes = await fetch(data.cdp_url);
        const cdpData = (await cdpRes.json()) as { webSocketDebuggerUrl?: string };
        cdpWsUrl = cdpData.webSocketDebuggerUrl ?? null;
      } catch (err) {
        this.log.warn({ sessionId: id, err }, "Failed to resolve CDP WebSocket URL");
      }
    }

    const liveUrl = data.live_url ? `${data.live_url}?theme=light` : null;

    return {
      id: data.id,
      status: data.status,
      cdpWsUrl,
      liveUrl,
      timeoutAt: data.timeout_at ?? null,
      startedAt: data.started_at ?? null,
      finishedAt: data.finished_at ?? null,
    };
  }

  async stopSession(id: string): Promise<void> {
    this.log.info({ sessionId: id }, "Stopping browser session");

    try {
      await this.apiFetch(`/browsers/${id}`, { method: "DELETE" });
      this.log.info({ sessionId: id }, "Browser session stopped");
    } catch (err) {
      this.log.warn({ sessionId: id, err }, "Failed to stop browser session (may have already expired)");
    }
  }
}
