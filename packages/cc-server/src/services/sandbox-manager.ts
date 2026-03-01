import { Daytona, type Sandbox } from "@daytonaio/sdk";

import { config } from "../config";
import { logger } from "../config/logger";

export type SandboxInfo = {
  sandboxId: string;
  baseUrl: string;
  previewToken: string;
};

const CC_SERVER_PORT = 3002;

export class SandboxManager {
  private readonly daytona: Daytona;
  private readonly log = logger.child({ service: "sandbox-manager" });
  private readonly sandboxes = new Map<string, Sandbox>();

  constructor() {
    this.daytona = new Daytona({
      apiKey: config.daytona.apiKey,
      apiUrl: config.daytona.apiUrl,
      target: config.daytona.target,
    });
  }

  async createSandbox(opts?: {
    envVars?: Record<string, string>;
    cpu?: number;
    memory?: number;
    disk?: number;
    autostopMinutes?: number;
  }): Promise<SandboxInfo> {
    this.log.info("Creating Daytona sandbox");

    const sandbox = await this.daytona.create({
      image: "oven/bun:1-slim",
      language: "typescript",
      envVars: {
        ANTHROPIC_API_KEY: config.anthropic.apiKey,
        PORT: String(CC_SERVER_PORT),
        HOST: "0.0.0.0",
        ...opts?.envVars,
      },
      resources: {
        cpu: opts?.cpu ?? 2,
        memory: opts?.memory ?? 4,
        disk: opts?.disk ?? 8,
      },
      autoStopInterval: opts?.autostopMinutes ?? 30,
    });

    this.sandboxes.set(sandbox.id, sandbox);
    this.log.info({ sandboxId: sandbox.id }, "Sandbox created");

    // Install system deps, copy cc-server code, install bun deps, start server
    await sandbox.process.executeCommand(
      "apt-get update && apt-get install -y git bash curl python3 && rm -rf /var/lib/apt/lists/*",
    );

    // TODO: Upload cc-server source or pull from registry
    // For now, assumes the code is available at /app in the sandbox
    await sandbox.process.executeCommand("bun install --production", "/app");

    // Start cc-server in background using a session
    const sessionId = `cc-server-${sandbox.id}`;
    await sandbox.process.createSession(sessionId);
    await sandbox.process.executeSessionCommand(sessionId, {
      command: `cd /app && PORT=${CC_SERVER_PORT} bun src/index.ts`,
      runAsync: true,
    });

    // Wait for server to be ready
    await this.waitForHealthy(sandbox);

    const preview = await sandbox.getPreviewLink(CC_SERVER_PORT);

    this.log.info(
      { sandboxId: sandbox.id, url: preview.url },
      "Sandbox ready",
    );

    return {
      sandboxId: sandbox.id,
      baseUrl: preview.url,
      previewToken: preview.token,
    };
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      this.log.warn({ sandboxId }, "Sandbox not found in local registry");
      return;
    }

    this.log.info({ sandboxId }, "Destroying sandbox");
    await this.daytona.delete(sandbox, 60);
    this.sandboxes.delete(sandboxId);
    this.log.info({ sandboxId }, "Sandbox destroyed");
  }

  async stopSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await this.daytona.stop(sandbox);
    this.log.info({ sandboxId }, "Sandbox stopped");
  }

  async startSandbox(sandboxId: string): Promise<SandboxInfo> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await this.daytona.start(sandbox);
    await this.waitForHealthy(sandbox);

    const preview = await sandbox.getPreviewLink(CC_SERVER_PORT);

    this.log.info({ sandboxId, url: preview.url }, "Sandbox restarted");

    return {
      sandboxId: sandbox.id,
      baseUrl: preview.url,
      previewToken: preview.token,
    };
  }

  private async waitForHealthy(sandbox: Sandbox, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const interval = 500;

    while (Date.now() < deadline) {
      try {
        const result = await sandbox.process.executeCommand(
          `curl -sf http://localhost:${CC_SERVER_PORT}/health`,
        );

        if (result.exitCode === 0) {
          return;
        }
      } catch {
        // Server not ready yet
      }

      await Bun.sleep(interval);
    }

    throw new Error(`cc-server health check timed out after ${timeoutMs}ms`);
  }
}
