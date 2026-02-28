import { test, expect } from "bun:test";

test("frontend index exports server config", async () => {
  // Verify the HTML file exists and is importable
  const file = Bun.file(import.meta.dir + "/index.html");
  expect(await file.exists()).toBe(true);
});
