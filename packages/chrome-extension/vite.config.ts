import { resolve } from "path";
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    webExtension({
      manifest: () => ({
        manifest_version: 3,
        name: "Skill Factory Recorder",
        version: "1.0.0",
        description:
          "Chrome extension recording user behavior for AI agent browsing workflows",
        action: {
          default_popup: "src/popup/popup.html",
        },
        background: {
          service_worker: "src/background/index.ts",
          type: "module",
        },
        permissions: ["activeTab", "tabs", "storage", "scripting", "cookies"],
        host_permissions: ["<all_urls>"],
        content_scripts: [
          {
            matches: ["<all_urls>"],
            js: ["src/content/index.ts"],
            run_at: "document_start",
            all_frames: true,
            match_about_blank: true,
          },
        ],
      }),
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "src/shared"),
      "@content": resolve(__dirname, "src/content"),
      "@background": resolve(__dirname, "src/background"),
      "@popup": resolve(__dirname, "src/popup"),
      "@export": resolve(__dirname, "src/export"),
      "@api": resolve(__dirname, "src/api"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : false,
  },
});
