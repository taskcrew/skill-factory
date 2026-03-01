import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("claude_session_id", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("created"))
    .addColumn("config", "jsonb", (col) => col.notNull().defaultTo("{}"))
    .addColumn("browser_session_id", "text")
    .addColumn("sandbox_id", "text")
    .addColumn("sdk_init", "jsonb")
    .addColumn("result", "jsonb")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("session_messages")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("session_id", "uuid", (col) =>
      col.notNull().references("sessions.id").onDelete("cascade")
    )
    .addColumn("sdk_message_id", "uuid")
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("subtype", "text")
    .addColumn("parent_tool_use_id", "text")
    .addColumn("content", "jsonb", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("session_messages_session_id_idx")
    .on("session_messages")
    .columns(["session_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("session_messages").execute();
  await db.schema.dropTable("sessions").execute();
}
