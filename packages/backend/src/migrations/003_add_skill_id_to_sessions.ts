import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions ADD COLUMN skill_id UUID REFERENCES skills(id) ON DELETE SET NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions DROP COLUMN skill_id`.execute(db);
}
