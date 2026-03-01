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
    if (!config.browserUse.apiKey) {
      throw new Error("BROWSER_USE_API_KEY is required for Browser Use operations");
    }

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
        `Browser Use API error: ${res.status} ${res.statusText} - ${body}`,
      );
    }

    return res;
  }

  async createSession(): Promise<BrowserSession> {
    this.log.info("Creating browser session");
    const res = await this.apiFetch("/browsers", {
      method: "POST",
      body: JSON.stringify({
        timeout: 30,
        browserScreenWidth: 1280,
        browserScreenHeight: 800,
      }),
    });
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
      cdpUrl?: string;
      liveUrl?: string;
      timeoutAt?: string;
      startedAt?: string;
      finishedAt?: string;
    };

    let cdpWsUrl: string | null = null;
    if (data.cdpUrl) {
      try {
        const cdpRes = await fetch(data.cdpUrl);
        const cdpData = (await cdpRes.json()) as { webSocketDebuggerUrl?: string };
        cdpWsUrl = cdpData.webSocketDebuggerUrl ?? null;
      } catch (err) {
        this.log.warn({ sessionId: id, err }, "Failed to resolve CDP WebSocket URL");
      }
    }

    const liveUrl = data.liveUrl ?? null;

    return {
      id: data.id,
      status: data.status,
      cdpWsUrl,
      liveUrl,
      timeoutAt: data.timeoutAt ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
    };
  }
}
