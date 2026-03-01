import type { Context } from "hono";

import type { AppEnv } from "../types/hono-env";
import type { SandboxManager } from "../services/sandbox-manager";

export function createSandboxHandler(manager: SandboxManager) {
  return async (c: Context<AppEnv>) => {
    let body: {
      envVars?: Record<string, string>;
      cpu?: number;
      memory?: number;
      disk?: number;
      autostopMinutes?: number;
    };

    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    try {
      const info = await manager.createSandbox(body);
      return c.json(info, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      c.get("log").error({ error: message }, "Failed to create sandbox");
      return c.json({ error: message }, 500);
    }
  };
}

export function destroySandboxHandler(manager: SandboxManager) {
  return async (c: Context<AppEnv>) => {
    const sandboxId = c.req.param("id");

    const info = manager.getSandboxInfo(sandboxId);
    if (!info) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    try {
      await manager.destroySandbox(sandboxId);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      c.get("log").error({ error: message }, "Failed to destroy sandbox");
      return c.json({ error: message }, 500);
    }
  };
}

export function proxySandboxExecuteHandler(manager: SandboxManager) {
  return async (c: Context<AppEnv>) => {
    const sandboxId = c.req.param("id");

    const info = manager.getSandboxInfo(sandboxId);
    if (!info) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${info.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-daytona-preview-token": info.previewToken,
        },
        body: JSON.stringify(await c.req.json()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      c.get("log").error({ error: message, sandboxId }, "Sandbox unreachable");
      return c.json({ error: "Sandbox unreachable" }, 502);
    }

    // Pipe the SSE stream through
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };
}

export function proxySandboxQueryHandler(manager: SandboxManager) {
  return async (c: Context<AppEnv>) => {
    const sandboxId = c.req.param("id");

    const info = manager.getSandboxInfo(sandboxId);
    if (!info) {
      return c.json({ error: "Sandbox not found" }, 404);
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${info.baseUrl}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-daytona-preview-token": info.previewToken,
        },
        body: JSON.stringify(await c.req.json()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      c.get("log").error({ error: message, sandboxId }, "Sandbox unreachable");
      return c.json({ error: "Sandbox unreachable" }, 502);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      c.get("log").error(
        { sandboxId, status: upstream.status, upstreamBody: text },
        "Sandbox query returned error",
      );
      return c.json({ error: "Sandbox returned error", status: upstream.status, detail: text }, 502);
    }

    let data: unknown;
    try {
      data = await upstream.json();
    } catch {
      return c.json({ error: "Sandbox returned non-JSON response" }, 502);
    }

    return c.json(data);
  };
}
