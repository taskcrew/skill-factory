import { type Generated, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

export interface SessionTable {
  id: Generated<string>;
  name: string;
  claude_session_id: string | null;
  status: Generated<string>;
  config: Generated<unknown>;
  browser_session_id: string | null;
  sandbox_id: string | null;
  sdk_init: unknown | null;
  result: unknown | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SessionMessageTable {
  id: Generated<string>;
  session_id: string;
  sdk_message_id: string | null;
  type: string;
  subtype: string | null;
  parent_tool_use_id: string | null;
  content: unknown;
  created_at: Generated<Date>;
}

export interface SkillTable {
  id: Generated<string>;
  name: string;
  filename: string;
  content: string;
  description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  sessions: SessionTable;
  session_messages: SessionMessageTable;
  skills: SkillTable;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});
