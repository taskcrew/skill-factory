import { test, expect } from "bun:test";
import { app } from "./index";

test("health endpoint returns ok", async () => {
  const res = await app.fetch(new Request("http://localhost/api/health"));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual({ status: "ok", service: "backend" });
});

test("root endpoint returns ok", async () => {
  const res = await app.fetch(new Request("http://localhost/"));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual({ message: "backend ok" });
});
