import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const uiMessages = JSON.parse(readFileSync("src/i18n/zh-CN.json", "utf8"));

function gitOutput(args: string[]): string | null {
  try {
    const value = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function getBuildId(): string {
  const commit = gitOutput(["rev-parse", "--short=12", "HEAD"]);
  if (!commit) return "unknown";
  const dirty = Boolean(gitOutput(["status", "--porcelain"]));
  return dirty ? `${commit}-dirty` : commit;
}

const buildId = getBuildId();

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const cliArgs = process.argv.slice(2);
const portArgumentIndex = cliArgs.findIndex((value: string) => value === "--port" || value === "-p");
const inlinePort = cliArgs.find((value: string) => value.startsWith("--port="))?.slice("--port=".length);
const requestedPort = inlinePort ?? (portArgumentIndex >= 0 ? cliArgs[portArgumentIndex + 1] : undefined);
const devPort = /^\d+$/.test(requestedPort ?? "") ? Number(requestedPort) : 1420;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), {
    name: "interface-document-titles",
    transformIndexHtml: (html) => html.replace("%UI_OBS_TITLE%", uiMessages["obs.pageTitle"]),
  }],
  build: { rollupOptions: { input: { main: "index.html", obs: "obs.html" } } },
  cacheDir: `node_modules/.vite-${devPort}`,
  define: {
    __DANMU_BUILD_ID__: JSON.stringify(buildId),
  },
  optimizeDeps: {
    include: [
      "monaco-editor/esm/nls.messages.zh-cn.js",
      "monaco-editor/esm/vs/editor/editor.all.js",
      "monaco-editor/esm/vs/editor/editor.api",
      "monaco-editor/esm/vs/language/css/monaco.contribution",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: devPort,
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
  },
}));
