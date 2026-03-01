import { test, expect } from "bun:test";

test("index.html exists", async () => {
  const file = Bun.file(import.meta.dir + "/index.html");
  expect(await file.exists()).toBe(true);
});

test("router module exports router", async () => {
  const { router } = await import("./router");
  expect(router).toBeDefined();
  expect(router.routeTree).toBeDefined();
});
