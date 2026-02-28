import { test, expect, describe } from "bun:test";
import { envSchema } from "./env";

const VALID_DB_URL = "postgres://user:password@localhost:5432/skill_factory";

describe("envSchema", () => {
  test("applies defaults when no values provided (except DATABASE_URL)", () => {
    const result = envSchema.safeParse({ DATABASE_URL: VALID_DB_URL });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      PORT: 3001,
      NODE_ENV: "development",
      DATABASE_URL: VALID_DB_URL,
    });
  });

  test("coerces PORT string to number", () => {
    const result = envSchema.safeParse({ PORT: "8080", DATABASE_URL: VALID_DB_URL });
    expect(result.success).toBe(true);
    expect(result.data!.PORT).toBe(8080);
  });

  test("rejects invalid PORT", () => {
    const result = envSchema.safeParse({ PORT: "not-a-number", DATABASE_URL: VALID_DB_URL });
    expect(result.success).toBe(true);
    expect(result.data!.PORT).toBeNaN();
  });

  test("accepts valid NODE_ENV values", () => {
    for (const val of ["development", "production", "test"] as const) {
      const result = envSchema.safeParse({ NODE_ENV: val, DATABASE_URL: VALID_DB_URL });
      expect(result.success).toBe(true);
      expect(result.data!.NODE_ENV).toBe(val);
    }
  });

  test("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({ NODE_ENV: "staging", DATABASE_URL: VALID_DB_URL });
    expect(result.success).toBe(false);
  });

  test("requires DATABASE_URL", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("accepts valid DATABASE_URL", () => {
    const result = envSchema.safeParse({ DATABASE_URL: VALID_DB_URL });
    expect(result.success).toBe(true);
    expect(result.data!.DATABASE_URL).toBe(VALID_DB_URL);
  });
});
