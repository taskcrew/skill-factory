import { resolve, dirname } from "node:path";
import { Daytona, Image, type Sandbox } from "@daytonaio/sdk";

import { config } from "../config";
import { logger } from "../logger";

const CC_SERVER_DOCKERFILE = resolve(
  dirname(import.meta.filename),
  "../../../cc-server/Dockerfile",
);

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
  private readonly sandboxInfos = new Map<string, SandboxInfo>();

  constructor() {
    this.daytona = new Daytona({
      apiKey: config.daytona.apiKey,
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
    this.log.info("Creating Daytona sandbox from cc-server Dockerfile");

    const sandbox = await this.daytona.create(
      {
        image: Image.fromDockerfile(CC_SERVER_DOCKERFILE),
        language: "typescript",
        user: "appuser",
        envVars: {
          ANTHROPIC_API_KEY: config.anthropic.apiKey,
          ...(config.anthropic.baseUrlOverride
            ? { ANTHROPIC_BASE_URL_OVERRIDE: config.anthropic.baseUrlOverride }
            : {}),
          ...opts?.envVars,
        },
        resources: {
          cpu: opts?.cpu ?? 2,
          memory: opts?.memory ?? 4,
          disk: opts?.disk ?? 8,
        },
        autoStopInterval: opts?.autostopMinutes ?? 30,
      },
      {
        timeout: 300,
        onSnapshotCreateLogs: (chunk) => {
          this.log.debug({ chunk: chunk.trimEnd() }, "Image build log");
        },
      },
    );

    this.sandboxes.set(sandbox.id, sandbox);
    this.log.info({ sandboxId: sandbox.id }, "Sandbox created");

    // Start cc-server in a background session
    const sessionId = `cc-server-${sandbox.id}`;
    await sandbox.process.createSession(sessionId);
    await sandbox.process.executeSessionCommand(sessionId, {
      command: "cd /app && bun src/index.ts",
      runAsync: true,
    });

    // Wait for health endpoint to respond
    await this.waitForHealthy(sandbox);

    const preview = await sandbox.getPreviewLink(CC_SERVER_PORT);

    const info: SandboxInfo = {
      sandboxId: sandbox.id,
      baseUrl: preview.url,
      previewToken: preview.token,
    };

    this.sandboxInfos.set(sandbox.id, info);

    this.log.info(
      { sandboxId: sandbox.id, url: preview.url },
      "cc-server running in sandbox",
    );

    return info;
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
    this.sandboxInfos.delete(sandboxId);
    this.log.info({ sandboxId }, "Sandbox destroyed");
  }

  getSandboxInfo(sandboxId: string): SandboxInfo | undefined {
    return this.sandboxInfos.get(sandboxId);
  }

  private async waitForHealthy(sandbox: Sandbox, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const interval = 1_000;

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
