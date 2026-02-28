import { test, expect } from "bun:test";

test("health endpoint returns ok", async () => {
  const res = await fetch("http://localhost:3001/api/health");
  const data = await res.json();
  expect(data).toEqual({ status: "ok", service: "backend" });
});
