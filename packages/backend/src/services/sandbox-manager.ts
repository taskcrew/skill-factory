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
# Skill Format Specification

A **skill** is a reusable browser automation script. It's a bash file containing \`agent-browser\` commands that replay a recorded user workflow.

\`\`\`
User browses → Chrome extension captures events → System generates workflow.sh → Agent replays it
\`\`\`

---

## File Format

A skill is a single \`.sh\` file with a header comment block and sequential \`agent-browser\` steps:

\`\`\`bash
#!/bin/bash
# Skill: <name>
# Recorded: <date>
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

### Header

\`\`\`bash
#!/bin/bash
# Skill: <human-readable name>
# Recorded: <YYYY-MM-DD>
# Source URL: <the URL where recording started>
\`\`\`

### Steps

Each step is a comment describing the action followed by one or more \`agent-browser\` commands:

\`\`\`bash
# Step N: <description of what this step does>
agent-browser <command> [args...]
\`\`\`

---

## agent-browser Commands

| Command | Description |
|---|---|
| \`open <url>\` | Navigate to URL |
| \`snapshot\` | Print accessibility tree with @refs |
| \`snapshot -i\` | Interactive elements only |
| \`screenshot [path]\` | Take screenshot |
| \`click <@ref>\` | Click element by ref |
| \`dblclick <@ref>\` | Double-click element |
| \`fill <@ref> <text>\` | Clear field and type text |
| \`type <@ref> <text>\` | Append text (no clear) |
| \`press <key>\` | Press key (Enter, Tab, Escape, etc.) |
| \`hover <@ref>\` | Hover over element |
| \`scroll <dir> [px]\` | Scroll up/down/left/right |
| \`wait <sel\\|ms>\` | Wait for element or milliseconds |
| \`wait --load networkidle\` | Wait for page load |
| \`find css <selector> <action>\` | Find element by CSS, then act |
| \`find text <text> <action>\` | Find element by text, then act |
| \`find role <role> <action> --name <name>\` | Find by ARIA role and name |
| \`eval <js>\` | Run JavaScript |
| \`connect <url>\` | Connect to browser via CDP |

### Element Targeting

Scripts from recordings use CSS selectors via \`find css\`. At replay time:

- **\`find css "<selector>" <action>\`** — uses the CSS selector captured during recording
- **\`find text "<selector>" <action>\`** — matches by Playwright-style text selector (e.g. \`span:has-text("Login")\`)
- **\`find role <role> <action> --name "<name>"\`** — matches ARIA role + accessible name
- **\`@ref\`** — element references from \`agent-browser snapshot\` output (live, not from recording)

---

## How Recordings Become Skills

The Chrome extension captures DOM events. Each event type maps to an \`agent-browser\` command:

| Browser Event | Generated Command |
|---|---|
| Page navigation | \`agent-browser open "<url>"\` |
| Click on element | \`agent-browser find css "<selector>" click\` |
| Click on text | \`agent-browser find text "<selector>" click\` |
| Click on role | \`agent-browser find role <role> click --name "<name>"\` |
| Text input | \`agent-browser find css "<selector>" fill "<value>"\` |
| Scroll | \`agent-browser scroll down <px>\` |
| Key press | \`agent-browser press <key>\` |
| Hover | \`agent-browser find css "<selector>" hover\` |
| Form submit | \`agent-browser press Enter\` |

### Selector Generation

The extension generates selectors in priority order:

1. \`data-testid\` attribute → most stable across deploys
2. \`#id\` → stable if the ID is unique and not auto-generated
3. ARIA selector (\`[role="button"][name="Submit"]\`) → accessible and semantic
4. CSS path (\`div > ul > li:nth-of-type(3) > a\`) → fallback, most brittle

---

## Execution

Before running a skill script, the agent must connect to a remote browser:

\`\`\`bash
agent-browser connect "$AGENT_BROWSER_CDP"
bash /path/to/skill.sh
\`\`\`

### Error Recovery

When a step fails during replay:

1. **Element not found** — run \`agent-browser snapshot\`, find the element by description, use its @ref
2. **Page not loaded** — add \`agent-browser wait --load networkidle\` before the failing step
3. **Wrong page state** — a previous step may have triggered unexpected navigation; re-orient with \`agent-browser snapshot\`
4. **Form validation** — input values from the recording may need adjustment for the target environment

### Tips

- Steps are sequential — order matters
- After \`agent-browser open\`, always wait for the page to load before interacting
- \`snapshot\` is the agent's eyes — use it liberally when something breaks
- CSS selectors from recordings can break when the site changes; the step description comment tells the agent *what* to click, so it can find the element another way
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
    await sandbox.fs.uploadFile(
      Buffer.from(content, "utf-8"),
      `${skillDir}/assets/${filename}`,
    );

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
