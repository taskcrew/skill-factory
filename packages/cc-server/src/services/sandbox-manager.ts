import { Daytona, Image, type Sandbox } from "@daytonaio/sdk";
import { resolve, dirname } from "node:path";

import { config } from "../config";
import { logger } from "../config/logger";

export type SandboxInfo = {
  sandboxId: string;
  baseUrl: string;
  previewToken: string;
};

const CC_SERVER_PORT = 3002;

// Resolve the cc-server package root relative to this file
const CC_SERVER_ROOT = resolve(dirname(import.meta.filename), "..", "..");

function buildCcServerImage(): Image {
  return Image.base("node:22-slim")
    .runCommands(
      // System deps
      "apt-get update && apt-get install -y git bash curl python3 python3-venv wget jq && rm -rf /var/lib/apt/lists/*",
      // Install Claude Code CLI + agent-browser globally
      "npm install -g @anthropic-ai/claude-code agent-browser tsx",
      // Create a non-root user — Claude Code refuses --dangerously-skip-permissions as root
      "useradd -m -s /bin/bash claude",
      // Create workspace for Claude Code to operate in
      "mkdir -p /workspace && chown claude:claude /workspace",
      "mkdir -p /app",
    )
    // Add cc-server source into the image
    .addLocalDir(CC_SERVER_ROOT, "/app")
    .workdir("/app")
    .runCommands(
      // Install cc-server dependencies
      "npm install --production",
      // Give the non-root user ownership of /app
      "chown -R claude:claude /app",
    )
    .env({
      PORT: String(CC_SERVER_PORT),
      HOST: "0.0.0.0",
    });
}

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
    this.log.info("Creating Daytona sandbox with cc-server image");

    const sandbox = await this.daytona.create(
      {
        image: buildCcServerImage(),
        language: "typescript",
        user: "claude",
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
        onSnapshotCreateLogs: (chunk) => {
          this.log.debug({ chunk: chunk.trim() }, "Image build log");
        },
        timeout: 300, // 5 min for image build
      },
    );

    this.sandboxes.set(sandbox.id, sandbox);
    this.log.info({ sandboxId: sandbox.id }, "Sandbox created");

    // Start cc-server in a background session
    const sessionId = `cc-server-${sandbox.id}`;
    await sandbox.process.createSession(sessionId);
    await sandbox.process.executeSessionCommand(sessionId, {
      command: "runuser -u claude -- bash -c 'cd /app && npx tsx src/index.ts'",
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

    // Restart cc-server after sandbox resume
    const sessionId = `cc-server-${sandbox.id}`;
    try {
      await sandbox.process.createSession(sessionId);
    } catch {
      // Session may already exist from previous start
    }
    await sandbox.process.executeSessionCommand(sessionId, {
      command: "runuser -u claude -- bash -c 'cd /app && npx tsx src/index.ts'",
      runAsync: true,
    });

    await this.waitForHealthy(sandbox);

    const preview = await sandbox.getPreviewLink(CC_SERVER_PORT);

    const info: SandboxInfo = {
      sandboxId: sandbox.id,
      baseUrl: preview.url,
      previewToken: preview.token,
    };

    this.sandboxInfos.set(sandbox.id, info);

    this.log.info({ sandboxId, url: preview.url }, "Sandbox restarted");

    return info;
  }

  getSandboxInfo(sandboxId: string): SandboxInfo | undefined {
    return this.sandboxInfos.get(sandboxId);
  }

  private async waitForHealthy(sandbox: Sandbox, timeoutMs = 60_000): Promise<void> {
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

      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`cc-server health check timed out after ${timeoutMs}ms`);
  }
}
