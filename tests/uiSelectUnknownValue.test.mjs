import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

let vite;
test.after(async () => { await vite?.close(); });

test("下拉切换到不存在的值时清空上一项标签", async () => {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-uiSelectUnknownValue.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    server: {watch:null, middlewareMode: true },
    logLevel: "silent",
  });
  const { resolveUiSelectValue } = await vite.ssrLoadModule("/src/components/ui/Select.tsx");
  const options = [
    { value: "native", label: "原生默认" },
    { value: "laplace", label: "LAPLACE 默认" },
  ];

  assert.equal(resolveUiSelectValue(options, "laplace"), "laplace");
  assert.equal(resolveUiSelectValue(options, "deleted-theme"), undefined);
});
