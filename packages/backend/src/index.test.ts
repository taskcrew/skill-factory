import { test, expect } from "bun:test";
import { buildBaseApp } from "./app";

test("health endpoint returns ok", async () => {
  const app = buildBaseApp();
  const res = await app.request("/api/health");
  const data = await res.json();
  expect(data).toEqual({ status: "ok", service: "backend" });
});
