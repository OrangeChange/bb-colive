import { defineConfig } from "vite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import productionConfig from "../../vite.config.ts";
export default defineConfig(async (env) => {
  const config = await productionConfig(env);
  config.optimizeDeps = { entries: ["tests/fixtures/danmakuComposer.html"] };
  config.build = {
    ...config.build,
    outDir: join(tmpdir(), "bb-colive-danmaku-fixture-20261126"),
    emptyOutDir: false,
    rollupOptions: { input: "tests/fixtures/danmakuComposer.html" },
  };
  return config;
});
