import { createServer as createViteServer, mergeConfig } from "vite";
import { fileURLToPath } from "node:url";

/** SSR组件测试沿用应用源码别名，不加载开发服务器与构建插件。 */
export function createServer(config) {
  return createViteServer(mergeConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  }, config));
}
