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

const SKILL_MD_CONTENT = `\
---
name: browser-recording-replay
description: Replay recorded browser workflows using agent-browser CLI scripts. Use when the user provides a .sh recording script or asks to execute a recorded browser automation workflow.
allowed-tools: Bash(agent-browser:*) Bash(bash:*)
---

# Browser Recording Replay

Replay recorded browser workflows captured by the Chrome extension. Recordings are \`.sh\` scripts containing sequential \`agent-browser\` commands.

## Trigger

Use this skill when:

- The user provides a \`.sh\` recording script
- The user asks to replay or execute a recorded browser workflow
- A session has a skill with a \`workflow.sh\` asset attached

## Execution

1. Connect to the remote browser:
   \`\`\`bash
   agent-browser connect "$AGENT_BROWSER_CDP"
   \`\`\`
2. Run the workflow script:
   \`\`\`bash
   bash /path/to/workflow.sh
   \`\`\`
3. Verify the final page state matches the expected outcome.

If running steps individually (for debugging or adaptation), execute each \`agent-browser\` command from the script one at a time.

## Script Format

Recording scripts follow this structure:

\`\`\`bash
#!/bin/bash
# Skill: <name>
# Recorded: <YYYY-MM-DD>
# Source URL: <starting-url>

# Step 1: Navigate to starting page
agent-browser open "<url>"
agent-browser wait --load networkidle

# Step 2: Discover interactive elements
agent-browser snapshot -i

# Step 3: Click "Introduction" and navigate
agent-browser find css "#sidebar > ul > li:nth-of-type(1) > a > span" click
agent-browser open "https://example.com/docs/introduction"

# Step 4: Click span "Authentication"
agent-browser find text "span:has-text(\\"Authentication\\")" click

# Step 5: Click link "Streaming"
agent-browser find role link click --name "Streaming"

# Step 6: Scroll down 500px
agent-browser scroll down 500
\`\`\`

Each step has a comment describing the action, followed by one or more \`agent-browser\` commands.

## Command Reference

See [references/agent-browser-commands.md](references/agent-browser-commands.md) for the full command list.

Core commands used in recordings:

| Command                                | Description                     |
| -------------------------------------- | ------------------------------- |
| \`open <url>\`                           | Navigate to URL                 |
| \`snapshot\`                             | Accessibility tree with @refs   |
| \`snapshot -i\`                          | Interactive elements only       |
| \`click <@ref>\`                         | Click element                   |
| \`fill <@ref> <text>\`                   | Clear and fill field            |
| \`type <@ref> <text>\`                   | Append text                     |
| \`press <key>\`                          | Press key (Enter, Tab, etc.)    |
| \`hover <@ref>\`                         | Hover over element              |
| \`scroll <dir> [px]\`                    | Scroll up/down/left/right       |
| \`wait --load networkidle\`              | Wait for page load              |
| \`find css <sel> <action>\`              | Find by CSS selector, then act  |
| \`find text <sel> <action>\`             | Find by text selector, then act |
| \`find role <role> <action> --name <n>\` | Find by ARIA role + name        |
| \`connect <url>\`                        | Connect to browser via CDP      |

## Element Targeting

Recording scripts use three \`find\` strategies:

- **\`find css "<selector>" <action>\`** \u2014 CSS selector from the recording
- **\`find text "<selector>" <action>\`** \u2014 Playwright-style text selector (e.g. \`span:has-text("Login")\`)
- **\`find role <role> <action> --name "<name>"\`** \u2014 ARIA role + accessible name

If a selector from the recording breaks at replay time, take a snapshot (\`agent-browser snapshot\`), find the target element by its @ref, and use that instead.

## Error Recovery

- **Element not found** \u2014 run \`agent-browser snapshot\`, locate the element by the step description, use its @ref
- **Page not loaded** \u2014 add \`agent-browser wait --load networkidle\` before the failing step
- **Wrong page state** \u2014 a previous step may have caused unexpected navigation; use \`agent-browser snapshot\` to re-orient
- **Form validation** \u2014 input values from the recording may need adjustment for the target environment

## Tips

- Steps are sequential \u2014 order matters
- After \`agent-browser open\`, always wait for the page to load before interacting
- \`snapshot\` is the agent\u2019s eyes \u2014 use it when something breaks
- CSS selectors can break when the site changes; the step comment tells you _what_ to target so you can find it another way
- A step may contain multiple commands (e.g. click + navigate)
`;

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

    const sessionId = `cc-server-${sandbox.id}`;
    await sandbox.process.createSession(sessionId);
    await sandbox.process.executeSessionCommand(sessionId, {
      command: "cd /app && npx tsx src/index.ts",
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

  async uploadSkill(
    sandboxId: string,
    name: string,
    filename: string,
    content: string,
  ): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found in local registry`);
    }

    const skillDir = `/workspace/.claude/skills/${name}`;
    await sandbox.process.executeCommand(`mkdir -p ${skillDir}/assets`);
    await sandbox.fs.uploadFile(
      Buffer.from(SKILL_MD_CONTENT, "utf-8"),
      `${skillDir}/SKILL.md`,
    );
    const assetPath = `${skillDir}/assets/${filename}`;
    await sandbox.fs.uploadFile(
      Buffer.from(content, "utf-8"),
      assetPath,
    );
    await sandbox.fs.setFilePermissions(assetPath, { mode: "755" });

    this.log.info(
      { sandboxId, name, filename },
      "Skill uploaded to sandbox",
    );
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

      await Bun.sleep(interval);
    }

    throw new Error(`cc-server health check timed out after ${timeoutMs}ms`);
  }
}
