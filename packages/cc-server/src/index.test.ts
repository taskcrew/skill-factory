import { test, expect } from "bun:test";

test("health endpoint returns ok", async () => {
  const res = await fetch("http://localhost:3002/api/health");
  const data = await res.json();
  expect(data).toEqual({ status: "ok", service: "cc-server" });
});
