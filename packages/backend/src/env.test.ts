import { test, expect, describe } from "bun:test";
import { envSchema } from "./env";

describe("envSchema", () => {
  test("applies defaults when no values provided", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      PORT: 3001,
      NODE_ENV: "development",
    });
  });

  test("coerces PORT string to number", () => {
    const result = envSchema.safeParse({ PORT: "8080" });
    expect(result.success).toBe(true);
    expect(result.data!.PORT).toBe(8080);
  });

  test("rejects invalid PORT", () => {
    const result = envSchema.safeParse({ PORT: "not-a-number" });
    expect(result.success).toBe(true);
    expect(result.data!.PORT).toBeNaN();
  });

  test("accepts valid NODE_ENV values", () => {
    for (const val of ["development", "production", "test"] as const) {
      const result = envSchema.safeParse({ NODE_ENV: val });
      expect(result.success).toBe(true);
      expect(result.data!.NODE_ENV).toBe(val);
    }
  });

  test("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({ NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });
});
