import { test, expect } from "bun:test";

test("health endpoint returns ok", async () => {
  process.env.ANTHROPIC_API_KEY ??= "test-key";

  const { build } = await import("./app");
  const executor = {
    on() {
      return this as any;
    },
    off() {
      return this as any;
    },
    async *executeTaskIterator() {},
  };
  const app = build(executor as any);

  const res = await app.request("/health");
  const data = await res.json();
  expect(data).toMatchObject({ status: "ok" });
  expect(typeof data.timestamp).toBe("string");
  expect(typeof data.uptime).toBe("number");
});
