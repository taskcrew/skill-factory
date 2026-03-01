import { Server as Engine } from "@socket.io/bun-engine";
import { Server, type Socket } from "socket.io";
import { db } from "./db";
import { logger } from "./logger";
import { persistMessages } from "./services/persist-messages";
import { sandboxManager } from "./services/sandbox";

const log = logger.child({ service: "socket" });

const io = new Server();
const engine = new Engine({ path: "/socket.io/" });

io.bind(engine);

io.on("connection", (socket: Socket) => {
  log.info({ socketId: socket.id }, "Client connected");

  socket.on("join", ({ sessionId }: { sessionId: string }) => {
    socket.join(`session:${sessionId}`);
    log.info({ socketId: socket.id, sessionId }, "Joined session room");
  });

  socket.on("execute", async (payload: { sessionId: string; task: string; [key: string]: unknown }) => {
    const { sessionId, task, ...executeOpts } = payload;

    log.info({ socketId: socket.id, sessionId }, "Execute requested");

    socket.join(`session:${sessionId}`);

    try {
      // Look up session + sandbox info
      const session = await db
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", sessionId)
        .executeTakeFirst();

      if (!session) {
        socket.emit("execution_error", { error: "Session not found" });
        return;
      }

      if (!session.sandbox_id) {
        socket.emit("execution_error", { error: "Session has no sandbox" });
        return;
      }

      const info = sandboxManager.getSandboxInfo(session.sandbox_id);
      if (!info) {
        socket.emit("execution_error", { error: "Sandbox not found in manager" });
        return;
      }

      // If the session has a skill, append an invisible instruction to the task
      let augmentedTask = task;
      if (session.skill_id) {
        const skill = await db
          .selectFrom("skills")
          .select(["name"])
          .where("id", "=", session.skill_id)
          .executeTakeFirst();
        if (skill) {
          augmentedTask = `${task}\n\nUse the provided skill "${skill.name}"`;
        }
      }

      // Build system prompt with available tools
      const memory = [
        "You are a browser automation agent with `agent-browser` CLI pre-installed.",
        "",
        "## Setup — run this FIRST before any browser command:",
        '  agent-browser connect "$AGENT_BROWSER_CDP"',
        "",
        "## Then use these commands:",
        "  agent-browser open <url>          # Navigate to a URL",
        "  agent-browser snapshot            # Accessibility tree with @refs (for AI)",
        "  agent-browser screenshot [path]   # Take a screenshot",
        "  agent-browser click <@ref>        # Click element by ref from snapshot",
        "  agent-browser type <@ref> <text>  # Type into element",
        "  agent-browser fill <@ref> <text>  # Clear and fill element",
        "  agent-browser press <key>         # Press key (Enter, Tab, etc.)",
        "  agent-browser eval <js>           # Run JavaScript",
        "",
        "## Important:",
        "- Do NOT install Playwright, puppeteer, or any browser. The remote browser is already running.",
        "- Always connect first, then use commands.",
        "- Use @refs from snapshot output to target elements (e.g. agent-browser click @e5).",
      ].join("\n");

      // Call cc-server /execute as SSE
      const upstream = await fetch(`${info.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-daytona-preview-token": info.previewToken,
        },
        body: JSON.stringify({
          task: augmentedTask,
          memory,
          ...executeOpts,
          ...(session.claude_session_id ? { sessionId: session.claude_session_id } : {}),
        }),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        log.error(
          { status: upstream.status, body: text.slice(0, 500) },
          "cc-server execute failed",
        );
        socket.emit("execution_error", { error: `cc-server returned ${upstream.status}` });
        return;
      }

      if (!upstream.body) {
        socket.emit("execution_error", { error: "No response body from cc-server" });
        return;
      }

      // Read SSE stream and relay events via Socket.IO
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let sawCompletion = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                if (currentEvent === "message") {
                  socket.emit("message", parsed);
                  persistMessages(sessionId, [parsed]).catch((err) =>
                    log.error({ err, sessionId }, "Failed to persist execute message"),
                  );
                } else if (currentEvent === "lifecycle") {
                  socket.emit("lifecycle", parsed);
                  if (parsed.type === "session_completed" || parsed.type === "session_error") {
                    sawCompletion = true;
                    if (parsed.sessionId) {
                      db.updateTable("sessions")
                        .set({ claude_session_id: parsed.sessionId })
                        .where("id", "=", sessionId)
                        .execute()
                        .catch((err) =>
                          log.error({ err, sessionId }, "Failed to persist claude_session_id"),
                        );
                    }
                  }
                } else if (currentEvent === "error") {
                  socket.emit("execution_error", parsed);
                } else if (currentEvent) {
                  socket.emit(currentEvent, parsed);
                }
              } catch {
                // Not valid JSON, skip
              }
              currentEvent = "";
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Emit session_completed if cc-server didn't
      if (!sawCompletion) {
        socket.emit("lifecycle", {
          type: "session_completed",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.error({ err, sessionId }, "Execute handler error");
      socket.emit("execution_error", {
        error: err instanceof Error ? err.message : "Internal server error",
      });
    }
  });

  socket.on("disconnect", () => {
    log.info({ socketId: socket.id }, "Client disconnected");
  });
});

export { io, engine };
