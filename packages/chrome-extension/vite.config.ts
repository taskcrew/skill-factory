import { resolve } from "path";
import { config } from "dotenv";
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  plugins: [
    webExtension({
      additionalInputs: ["src/permissions/request-mic.html"],
      manifest: () => ({
        manifest_version: 3,
        name: "Skill Factory Recorder",
        version: "1.0.0",
        description:
          "Chrome extension recording user behavior for AI agent browsing workflows",
        action: {},
        background: {
          service_worker: "src/background/index.ts",
          type: "module",
        },
        permissions: [
          "activeTab",
          "tabs",
          "storage",
          "scripting",
          "cookies",
          "sidePanel",
          "offscreen",
        ],
        side_panel: {
          default_path: "src/sidepanel/sidepanel.html",
        },
        web_accessible_resources: [
          {
            resources: ["src/permissions/request-mic.html"],
            matches: ["<all_urls>"],
          },
        ],
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
      "@sidepanel": resolve(__dirname, "src/sidepanel"),
      "@export": resolve(__dirname, "src/export"),
      "@api": resolve(__dirname, "src/api"),
      "@voice": resolve(__dirname, "src/voice"),
    },
  },
  define: {
    "import.meta.env.VITE_ELEVENLABS_API_KEY": JSON.stringify(
      process.env.ELEVENLABS_API_KEY || ""
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : false,
  },
});
