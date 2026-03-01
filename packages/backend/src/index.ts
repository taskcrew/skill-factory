import path from "node:path";
import { swaggerUI } from "@hono/swagger-ui";
import { FileMigrationProvider, Migrator } from "kysely";
import { cors } from "hono/cors";
import { db } from "./db";
import { buildBaseApp } from "./app";
import { agentRouter } from "./routes/agent";
import { sessionsRouter } from "./routes/sessions";

// Ensure sandbox singleton is initialized at startup
import "./services/sandbox";

// Run migrations before starting the server
const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs: await import("node:fs/promises"),
    path,
    migrationFolder: path.join(import.meta.dir, "migrations"),
  }),
});

const { error, results } = await migrator.migrateToLatest();

results?.forEach((it) => {
  if (it.status === "Success") {
    console.log(`Migration "${it.migrationName}" executed successfully`);
  } else if (it.status === "Error") {
    console.error(`Migration "${it.migrationName}" failed`);
  }
});

if (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}

console.log("Migrations up to date");

const app = buildBaseApp();

app.use("/*", cors());

app.route("/api/sessions", sessionsRouter);
app.route("/api/sessions", agentRouter);

app.doc31("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Skill Factory API",
    version: "0.1.0",
    description: "Agent SDK session management API",
  },
});

app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

const server = Bun.serve({
  port: Number(process.env.PORT) || 3001,
  fetch: app.fetch,
});

console.log(`Backend listening on http://localhost:${server.port}`);
