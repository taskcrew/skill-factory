import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "./env";

export interface Database {}

const dialect = new PostgresDialect({
  pool: new Pool({ connectionString: env.DATABASE_URL }),
});

export const db = new Kysely<Database>({ dialect });
