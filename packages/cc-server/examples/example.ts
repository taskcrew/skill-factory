/**
 * cc-server example client
 *
 * Usage:
 *   bun run example.ts                          # runs all examples
 *   bun run example.ts health                   # health check only
 *   bun run example.ts query "your prompt"      # one-shot query
 *   bun run example.ts execute "your prompt"    # streaming execution
 */

const BASE_URL = process.env.CC_SERVER_URL ?? "http://localhost:3002";
const WORKSPACE = process.env.CC_WORKSPACE ?? "/tmp";

// ── Health check ──────────────────────────────────────────────────────

async function health() {
  console.log("── GET /health ──");
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  console.log("Status:", res.status);
  console.log(JSON.stringify(data, null, 2));
  console.log();
  return data;
}

// ── One-shot query ────────────────────────────────────────────────────

async function queryExample(task: string) {
  console.log("── POST /query ──");
  console.log("Task:", task);
  console.log();

  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, workspacePath: WORKSPACE }),
  });

  if (!res.ok) {
    console.error("Error:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  console.log("Result:", data.result);
  console.log("Messages:", data.messages.length, "total");
  console.log();
  return data;
}

// ── Streaming execution (SSE) ─────────────────────────────────────────

async function executeExample(task: string) {
  console.log("── POST /execute (streaming) ──");
  console.log("Task:", task);
  console.log();

  const res = await fetch(`${BASE_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, workspacePath: WORKSPACE }),
  });

  if (!res.ok) {
    console.error("Error:", res.status, await res.text());
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    console.error("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          const data = JSON.parse(raw);

          if (currentEvent === "lifecycle") {
            console.log(`[lifecycle] ${data.type}`, data.sessionId ? `session=${data.sessionId}` : "");
          } else if (currentEvent === "message") {
            if (data.type === "assistant" && data.message?.content) {
              for (const block of data.message.content) {
                if (block.type === "text") {
                  process.stdout.write(block.text);
                } else if (block.type === "tool_use") {
                  console.log(`\n[tool_use] ${block.name}`);
                }
              }
            } else if (data.type === "result") {
              console.log(`\n[result] ${data.subtype}: ${data.result ?? "(no result text)"}`);
            }
          } else if (currentEvent === "error") {
            console.error("[error]", data.error);
          }
        } catch {
          // partial JSON, skip
        }
        currentEvent = "";
      }
    }
  }

  console.log("\n── stream ended ──\n");
}

// ── Main ──────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const prompt = rest.join(" ") || "What is 2 + 2? Reply in one sentence.";

switch (command) {
  case "health":
    await health();
    break;
  case "query":
    await queryExample(prompt);
    break;
  case "execute":
    await executeExample(prompt);
    break;
  default:
    // Run all examples
    await health();
    await queryExample(prompt);
    await executeExample(prompt);
    break;
}
