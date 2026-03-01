import path from "node:path";
import { FileMigrationProvider, Migrator } from "kysely";
import { db } from "./db";

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

console.log("All migrations applied successfully");
await db.destroy();
process.exit(0);
