import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      allow: ["..", "../.."],
    },
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("highlight.js") && id.includes("languages")) {
            return "vendor-hljs-grammars";
          }
          if (
            id.includes("prosemirror") ||
            id.includes("orderedmap") ||
            id.includes("w3c-keyname") ||
            id.includes("rope-sequence") ||
            id.includes("crelt")
          ) {
            return "vendor-prosemirror";
          }
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules\\react") ||
            id.includes("scheduler") ||
            id.includes("zustand") ||
            id.includes("@tauri-apps")
          ) {
            return "vendor-core";
          }
          return "vendor-tiptap";
        },
      },
    },
  },
}));





