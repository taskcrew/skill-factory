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
      ...(info.previewToken ? { "x-daytona-preview-token": info.previewToken } : {}),
    };

    // 2. Health check
    log("HEALTH", `GET ${info.baseUrl}/health`);
    const healthRes = await fetch(`${info.baseUrl}/health`, { headers });
    const healthText = await healthRes.text();
    log("HEALTH RESPONSE", {
      status: healthRes.status,
      contentType: healthRes.headers.get("content-type"),
      body: healthText.slice(0, 500),
    });

    if (healthRes.status !== 200) {
      throw new Error(`Health check failed with status ${healthRes.status}: ${healthText.slice(0, 200)}`);
    }

    const healthBody = JSON.parse(healthText);
    log("HEALTH OK", healthBody);

    // 3. Query
    log("QUERY", `POST ${info.baseUrl}/query`);
    const queryRes = await fetch(`${info.baseUrl}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        task: "What is 2 + 2? Reply with just the number.",
      }),
    });
    const queryText = await queryRes.text();
    log("QUERY RESPONSE", {
      status: queryRes.status,
      contentType: queryRes.headers.get("content-type"),
      body: queryText.slice(0, 1000),
    });

    if (queryRes.status !== 200) {
      throw new Error(`Query failed with status ${queryRes.status}: ${queryText.slice(0, 200)}`);
    }

    const queryBody = JSON.parse(queryText);
    log("QUERY OK", queryBody);

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
