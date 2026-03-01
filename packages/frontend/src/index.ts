import path from "node:path";

const srcDir = path.join(import.meta.dir);
const distDir = path.join(import.meta.dir, "..", "dist");

// Build the frontend bundle
const buildResult = await Bun.build({
  entrypoints: [path.join(srcDir, "App.tsx")],
  outdir: distDir,
  target: "browser",
  sourcemap: "inline",
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
  },
});

if (!buildResult.success) {
  console.error("Build failed:");
  for (const msg of buildResult.logs) {
    console.error(msg);
  }
  process.exit(1);
}

console.log(`Built ${buildResult.outputs.length} files to ${distDir}`);

// Copy static assets (index.html, index.css) to dist
const htmlSrc = Bun.file(path.join(srcDir, "index.html"));
const cssSrc = Bun.file(path.join(srcDir, "index.css"));
await Bun.write(path.join(distDir, "index.html"), htmlSrc);
await Bun.write(path.join(distDir, "index.css"), cssSrc);

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = path.join(distDir, url.pathname);

    // Try the exact file
    let file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback — serve index.html for non-asset routes
    return new Response(Bun.file(path.join(distDir, "index.html")));
  },
});

console.log(`Frontend listening on http://localhost:${server.port}`);
