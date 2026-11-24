import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");

let server;
let profile;

test.before(async () => {
  server = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-roomGuardProfile.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root, logLevel: "silent", server: {watch:null, middlewareMode: true } });
  profile = await server.ssrLoadModule("/src/protocol/roomGuardProfile.ts?room-guard-profile-test=1");
});

test.after(async () => {
  await server?.close();
});

test("主播档位 999 使用基础图标", () => {
  assert.deepEqual(profile.profileFromAchievementLevel(999), {
    anchorGuardAchieveLevel: 999,
    milestone: "standard",
    iconSet: "base",
    source: "room-info",
  });
});

test("主播档位 1000 使用千舰加强图标", () => {
  assert.deepEqual(profile.profileFromAchievementLevel(1000), {
    anchorGuardAchieveLevel: 1000,
    milestone: "thousand",
    iconSet: "enhanced",
    source: "room-info",
  });
});

test("主播档位 10000 使用万舰加强图标", () => {
  assert.deepEqual(profile.profileFromAchievementLevel(10000), {
    anchorGuardAchieveLevel: 10000,
    milestone: "tenThousand",
    iconSet: "enhanced",
    source: "room-info",
  });
});

test("缺失或非法档位使用未知基础图标", () => {
  assert.deepEqual(profile.profileFromAchievementLevel(undefined), {
    milestone: "unknown",
    iconSet: "base",
    source: "unknown",
  });
  assert.deepEqual(profile.profileFromAchievementLevel(-1), {
    milestone: "unknown",
    iconSet: "base",
    source: "unknown",
  });
  assert.deepEqual(profile.profileFromAchievementLevel(Number.NaN), {
    milestone: "unknown",
    iconSet: "base",
    source: "unknown",
  });
});

test("档位晚到时只回刷当前房间已有大航海事件", () => {
  const events = [
    { id: "current", roomId: 101, user: { uid: "u-1", uname: "用户", guardLevel: 1 } },
    { id: "other", roomId: 202, user: { uid: "u-2", uname: "用户2", guardLevel: 1 } },
    { id: "normal", roomId: 101, user: { uid: "u-3", uname: "普通用户", guardLevel: 0 } },
  ];
  const profileValue = {
    roomId: 101,
    anchorUid: "anchor-1",
    anchorGuardAchieveLevel: 10000,
    milestone: "tenThousand",
    iconSet: "enhanced",
    source: "room-info",
  };
  const updated = profile.applyRoomGuardProfileToEvents(events, 101, profileValue);
  assert.equal(updated[0].user.guardMilestone, "tenThousand");
  assert.equal(updated[0].user.guardIconSet, "enhanced");
  assert.equal(updated[1].user.guardIconSet, undefined);
  assert.equal(updated[2].user.guardIconSet, undefined);
});
