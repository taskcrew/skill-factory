import { test, expect, describe, beforeAll } from "bun:test";

describe("db module", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "postgres://user:password@localhost:5432/skill_factory";
    }
  });

  test("exports db with core Kysely methods", async () => {
    const { db } = await import("./db");
    expect(typeof db.selectFrom).toBe("function");
    expect(typeof db.insertInto).toBe("function");
    expect(typeof db.updateTable).toBe("function");
    expect(typeof db.deleteFrom).toBe("function");
    expect(typeof db.destroy).toBe("function");
  });
});
