/**
 * End-to-end test for the sandbox lifecycle:
 *   create → health check → query → destroy
 *
 * Usage:  bun packages/backend/scripts/test-sandbox.ts
 * Requires DAYTONA_API_KEY and ANTHROPIC_API_KEY in .env
 */

import { SandboxManager, type SandboxInfo } from "../src/services/sandbox-manager";

const log = (step: string, data?: unknown) =>
  console.log(`\n[${ step }]`, data ? JSON.stringify(data, null, 2) : "");

async function main() {
  const manager = new SandboxManager();
  let info: SandboxInfo | undefined;

  try {
    // 1. Create sandbox
    log("CREATE", "Starting sandbox creation (this may take a few minutes for image build)...");
    info = await manager.createSandbox();
    log("CREATE OK", { sandboxId: info.sandboxId, baseUrl: info.baseUrl });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(info.previewToken ? { "X-Preview-Token": info.previewToken } : {}),
    };

    // 2. Health check
    log("HEALTH", `GET ${info.baseUrl}/health`);
    const healthRes = await fetch(`${info.baseUrl}/health`, { headers });
    const healthBody = await healthRes.json();
    log("HEALTH OK", { status: healthRes.status, body: healthBody });

    if (healthRes.status !== 200) {
      throw new Error(`Health check failed with status ${healthRes.status}`);
    }

    // 3. Query
    log("QUERY", `POST ${info.baseUrl}/query`);
    const queryRes = await fetch(`${info.baseUrl}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: "What is 2 + 2? Reply with just the number.",
        options: { maxTurns: 1 },
      }),
    });
    const queryBody = await queryRes.json();
    log("QUERY OK", { status: queryRes.status, body: queryBody });

    if (queryRes.status !== 200) {
      throw new Error(`Query failed with status ${queryRes.status}`);
    }

    log("ALL TESTS PASSED");
  } catch (err) {
    console.error("\nTest failed:", err);
    process.exitCode = 1;
  } finally {
    // 4. Destroy sandbox
    if (info) {
      log("DESTROY", { sandboxId: info.sandboxId });
      await manager.destroySandbox(info.sandboxId);
      log("DESTROY OK");
    }
  }
}

main();
