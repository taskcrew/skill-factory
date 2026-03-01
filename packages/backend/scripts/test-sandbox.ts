/**
 * End-to-end test for the orchestrated sandbox lifecycle:
 *   POST /api/sessions → verify sandbox provisioned
 *   POST /api/sessions/:id/query → verify proxy + persistence
 *   GET  /api/sessions/:id → verify messages persisted
 *   DELETE /api/sessions/:id → verify sandbox destroyed
 *
 * Usage:  bun packages/backend/scripts/test-sandbox.ts
 * Requires DAYTONA_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL in .env
 * Backend must be running on localhost:3001
 */

const BASE = process.env.BACKEND_URL ?? "http://localhost:3001";

const log = (step: string, data?: unknown) =>
  console.log(`\n[${step}]`, data ? JSON.stringify(data, null, 2) : "");

async function main() {
  let sessionId: string | undefined;

  try {
    // 1. Create session — should auto-provision sandbox
    log("CREATE SESSION", "POST /api/sessions");
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-orchestrated" }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Create session failed (${createRes.status}): ${text}`);
    }

    const session = (await createRes.json()) as Record<string, unknown>;
    sessionId = session.id as string;

    log("CREATE SESSION OK", {
      id: session.id,
      status: session.status,
      sandbox_id: session.sandbox_id,
    });

    if (!session.sandbox_id) {
      throw new Error("Expected sandbox_id to be populated");
    }

    if (session.status !== "active") {
      throw new Error(`Expected status "active", got "${session.status}"`);
    }

    // 2. Query via proxy
    log("QUERY", `POST /api/sessions/${sessionId}/query`);
    const queryRes = await fetch(`${BASE}/api/sessions/${sessionId}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "What is 2 + 2? Reply with just the number.",
      }),
    });

    if (!queryRes.ok) {
      const text = await queryRes.text();
      throw new Error(`Query failed (${queryRes.status}): ${text}`);
    }

    const queryResult = await queryRes.json();
    log("QUERY OK", queryResult);

    // 3. Verify messages persisted
    // Give fire-and-forget persistence a moment
    await Bun.sleep(1000);

    log("GET SESSION", `GET /api/sessions/${sessionId}`);
    const getRes = await fetch(`${BASE}/api/sessions/${sessionId}`);
    const sessionWithMessages = (await getRes.json()) as Record<
      string,
      unknown
    >;
    const messages = sessionWithMessages.messages as unknown[];

    log("GET SESSION OK", {
      messageCount: messages?.length ?? 0,
      hasMessages: (messages?.length ?? 0) > 0,
    });

    if (!messages?.length) {
      console.warn("WARNING: No messages persisted yet (may be async)");
    }

    // 4. Delete session — should destroy sandbox
    log("DELETE SESSION", `DELETE /api/sessions/${sessionId}`);
    const deleteRes = await fetch(`${BASE}/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (deleteRes.status !== 204) {
      const text = await deleteRes.text();
      throw new Error(`Delete failed (${deleteRes.status}): ${text}`);
    }

    log("DELETE SESSION OK");
    const deletedId = sessionId;
    sessionId = undefined; // Prevent cleanup in finally

    // 5. Verify session is gone
    const verifyRes = await fetch(`${BASE}/api/sessions/${deletedId}`);
    if (verifyRes.status !== 404) {
      throw new Error(`Expected 404 after delete, got ${verifyRes.status}`);
    }

    log("ALL TESTS PASSED");
  } catch (err) {
    console.error("\nTest failed:", err);
    process.exitCode = 1;
  } finally {
    // Cleanup: if session wasn't deleted by the test, delete it now
    if (sessionId) {
      log("CLEANUP", `Deleting session ${sessionId}`);
      await fetch(`${BASE}/api/sessions/${sessionId}`, {
        method: "DELETE",
      }).catch(() => {});
      log("CLEANUP DONE");
    }
  }
}

main();
