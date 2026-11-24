import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let server;
let adapt;

test.before(async () => {
  server = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-fanMedalVisibility.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root, logLevel: "silent", server: {watch:null, middlewareMode: true } });
  ({ adapt } = await server.ssrLoadModule("/src/protocol/adapter.ts"));
});

test.after(async () => {
  await server?.close();
});

test("适配器把带主播 UID 的粉丝牌归属标记为当前或其他主播", () => {
  const context = { roomId: 123, anchorUid: "anchor-1", keepRaw: false };
  const current = adapt({ cmd: "INTERACT_WORD", data: {
    uid: "user-1", uname: "用户", uinfo: { medal: { name: "本场", level: 3, ruid: "anchor-1", is_light: 1 } },
  } }, context);
  const other = adapt({ cmd: "INTERACT_WORD", data: {
    uid: "user-2", uname: "用户2", uinfo: { medal: { name: "他场", level: 4, ruid: "anchor-2", is_light: 1 } },
  } }, context);

  assert.equal(current?.user?.medal?.isCurrentRoom, true);
  assert.equal(other?.user?.medal?.isCurrentRoom, false);
});
