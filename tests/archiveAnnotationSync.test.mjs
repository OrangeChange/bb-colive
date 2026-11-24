import test from "node:test";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HISTORICAL_UNKNOWN_FAVORITE_LABEL,
  migrateLegacyFavorites,
  useEventAnnotations,
} from "../src/eventAnnotations.ts";

const appSource = readApplicationSources();
const menuSource = readFileSync(
  fileURLToPath(new URL("../src/components/EventContextMenu.tsx", import.meta.url)),
  "utf8",
);
const settingsSource = readFileSync(
  fileURLToPath(new URL("../src/components/SettingsPanel.tsx", import.meta.url)),
  "utf8",
);
const workbenchSource = readFileSync(
  fileURLToPath(new URL("../src/components/RightWorkbench.tsx", import.meta.url)),
  "utf8",
);

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class FakeArchiveRepository {
  constructor(events, historicalStore = new Map()) {
    this.events = events;
    this.historicalStore = historicalStore;
    this.favoriteKeys = new Set();
    this.setFavoriteCalls = [];
    this.failNextFavoriteWrite = false;
    this.failNextHistoricalWrite = false;
  }

  async queryEvents() {
    return { items: this.events, nextCursor: null };
  }

  async setFavorite(eventKey, favorited) {
    this.setFavoriteCalls.push({ eventKey, favorited });
    if (this.failNextFavoriteWrite) {
      this.failNextFavoriteWrite = false;
      throw new Error("fake archive favorite failure");
    }
    if (!this.events.some((event) => event.eventKey === eventKey)) return;
    if (favorited) this.favoriteKeys.add(eventKey);
    else this.favoriteKeys.delete(eventKey);
  }

  async saveHistoricalFavorite(input) {
    if (this.failNextHistoricalWrite) {
      this.failNextHistoricalWrite = false;
      throw new Error("fake historical favorite failure");
    }
    this.historicalStore.set(input.legacyKey, JSON.parse(JSON.stringify(input)));
  }

  async listHistoricalFavorites() {
    return [...this.historicalStore.values()].map((item) => JSON.parse(JSON.stringify(item)));
  }
}

function event(id, uname = "原始用户名") {
  return {
    id,
    msgType: 0,
    roomId: 101,
    ts: 1_700_000_000_000,
    user: { uid: "uid-1", uname },
    text: id,
  };
}

function favoriteRecord(id, eventValue = event(id)) {
  return {
    key: `101:event:${id}`,
    roomId: 101,
    eventId: id,
    event: eventValue,
    favoritedAt: 1_700_000_001_000,
  };
}

function installStorage(storage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

test("旧收藏优先去重身份，重复原始 ID 只按唯一快照匹配", async () => {
  const first = event("rnd");
  const second = { ...first, dedupe: "second", ts: first.ts + 1000 };
  const rows = [first, second].map((value, index) => ({ eventKey: `session:archive-event:${index}`, roomId: 101, payloadJson: JSON.stringify(value) }));
  installStorage(new MemoryStorage({ "danmu-event-annotations": JSON.stringify({ state: { favorites: [favoriteRecord("rnd", second)] } }) }));
  const repository = new FakeArchiveRepository(rows);
  await migrateLegacyFavorites(repository);
  assert.deepEqual([...repository.favoriteKeys], ["session:archive-event:1"]);
  installStorage(new MemoryStorage({ "danmu-event-annotations": JSON.stringify({ state: { favorites: [favoriteRecord("rnd", first)] } }) }));
  const ambiguous = new FakeArchiveRepository([rows[0], { ...rows[0], eventKey: "another:archive-event:0" }]);
  const result = await migrateLegacyFavorites(ambiguous);
  assert.equal(result.unmatched, 1);
  assert.equal(ambiguous.favoriteKeys.size, 0);
});

test("旧收藏首次迁移保留明确现场映射，取消普通收藏后不会残留现场状态", async () => {
  const saved = favoriteRecord("matched");
  installStorage(new MemoryStorage({ "danmu-event-annotations": JSON.stringify({ state: { favorites: [saved] } }) }));
  useEventAnnotations.setState({ favorites: [saved] });
  try {
    const repository = new FakeArchiveRepository([{ eventKey: "session:archive-event:matched", roomId: 101, payloadJson: JSON.stringify(saved.event) }]);
    await migrateLegacyFavorites(repository);
    const projected = useEventAnnotations.getState().favorites;
    assert.equal(projected[0].archiveEventKey, "session:archive-event:matched");
    assert.equal(projected[0].favoritedAt, 1_700_000_001_000);
  } finally { useEventAnnotations.setState({ favorites: [] }); }
});

test("现场写入的收藏关系可被回看查询读取，回看移除后现场状态也不再收藏", async () => {
  const archiveEvent = event("live-1");
  const repository = new FakeArchiveRepository([{
    eventKey: "session-1:archive-event:live-1",
    sessionId: "session-1",
    roomId: 101,
    payloadJson: JSON.stringify(archiveEvent),
  }]);

  await repository.setFavorite("session-1:archive-event:live-1", true);
  assert.deepEqual([...repository.favoriteKeys], ["session-1:archive-event:live-1"]);
  assert.equal(repository.favoriteKeys.has("session-1:archive-event:live-1"), true);

  await repository.setFavorite("session-1:archive-event:live-1", false);
  assert.equal(repository.favoriteKeys.has("session-1:archive-event:live-1"), false);
});

test("旧收藏迁移只执行一次，匹配项写入新关系，未匹配项保留为历史未知且不清理旧存储", async () => {
  const storage = new MemoryStorage({
    "danmu-event-annotations": JSON.stringify({
      state: {
        favorites: [favoriteRecord("matched"), favoriteRecord("unknown")],
        regionMarks: { danmu: "101:event:matched" },
      },
      version: 0,
    }),
  });
  installStorage(storage);

  const repository = new FakeArchiveRepository([{
    eventKey: "session-9:archive-event:matched",
    sessionId: "session-9",
    roomId: 101,
    payloadJson: JSON.stringify(event("matched")),
  }]);

  const first = await migrateLegacyFavorites(repository);
  assert.equal(first.migrated, 1);
  assert.equal(first.unmatched, 1);
  assert.equal(first.unmatchedLabel, HISTORICAL_UNKNOWN_FAVORITE_LABEL);
  assert.deepEqual(repository.setFavoriteCalls, [{
    eventKey: "session-9:archive-event:matched",
    favorited: true,
  }]);
  assert.notEqual(storage.getItem("danmu-event-annotations"), null);
  assert.deepEqual(first.unmatchedFavorites.map((item) => item.eventId), ["unknown"]);

  const restartedRepository = new FakeArchiveRepository(repository.events, repository.historicalStore);
  const historical = await restartedRepository.listHistoricalFavorites();
  assert.deepEqual(historical.map((item) => ({
    legacyKey: item.legacyKey,
    eventId: item.eventId,
    label: item.label,
    uname: item.event.user.uname,
  })), [{
    legacyKey: "101:event:unknown",
    eventId: "unknown",
    label: HISTORICAL_UNKNOWN_FAVORITE_LABEL,
    uname: "原始用户名",
  }]);

  const second = await migrateLegacyFavorites(repository);
  assert.equal(second.alreadyMigrated, true);
  assert.equal(second.migrated, 0);
  assert.equal(repository.setFavoriteCalls.length, 1);
  assert.notEqual(storage.getItem("danmu-event-annotations"), null);
});

test("旧收藏写入失败时不确认迁移 marker，下一次调用仍可重试", async () => {
  const storage = new MemoryStorage({
    "danmu-event-annotations": JSON.stringify({ state: { favorites: [favoriteRecord("retry")] } }),
  });
  installStorage(storage);
  const repository = new FakeArchiveRepository([{
    eventKey: "session-retry:archive-event:retry",
    sessionId: "session-retry",
    roomId: 101,
    payloadJson: JSON.stringify(event("retry")),
  }]);
  repository.failNextFavoriteWrite = true;

  await assert.rejects(() => migrateLegacyFavorites(repository), /fake archive favorite failure/);
  assert.equal(storage.getItem("danmu-event-annotations.archive-migration-v1"), null);

  const retried = await migrateLegacyFavorites(repository);
  assert.equal(retried.migrated, 1);
  assert.equal(storage.getItem("danmu-event-annotations.archive-migration-v1"), "1");
});

test("历史未知收藏持久化失败时不确认 marker，下一次迁移可成功且 Repository 仍可写收藏", async () => {
  const storage = new MemoryStorage({
    "danmu-event-annotations": JSON.stringify({ state: { favorites: [favoriteRecord("unknown-retry")] } }),
  });
  installStorage(storage);
  const repository = new FakeArchiveRepository([{
    eventKey: "session-live:archive-event:live-now",
    sessionId: "session-live",
    roomId: 101,
    payloadJson: JSON.stringify(event("live-now")),
  }]);
  repository.failNextHistoricalWrite = true;

  await assert.rejects(() => migrateLegacyFavorites(repository), /fake historical favorite failure/);
  assert.equal(storage.getItem("danmu-event-annotations.archive-migration-v1"), null);

  await repository.setFavorite("session-live:archive-event:live-now", true);
  assert.equal(repository.favoriteKeys.has("session-live:archive-event:live-now"), true);

  const retried = await migrateLegacyFavorites(repository);
  assert.equal(retried.unmatched, 1);
  assert.equal(storage.getItem("danmu-event-annotations.archive-migration-v1"), "1");
  assert.equal((await repository.listHistoricalFavorites())[0].label, HISTORICAL_UNKNOWN_FAVORITE_LABEL);
});

test("现场使用收藏协调入口，回看作用域不提供事件标记", () => {
  assert.match(appSource, /createArchiveFavoriteActions\(archiveRepository\)\.set\(/);
  assert.match(appSource, /getArchiveEventKey/);
  assert.match(appSource, /restoreFavoriteEvent/);
  assert.match(menuSource, /scope\?:\s*(?:EventMenuScope|"live"\s*\|\s*"review")/);
  assert.match(menuSource, /scope !== "review"/);
  assert.match(menuSource, /scope === "review"/);
});

test("设置面板昵称添加、编辑和删除复用 App 层 Repository-backed callback", () => {
  assert.match(settingsSource, /onSaveNickname\?: \(uid: string, nickname: string\) => void/);
  assert.match(settingsSource, /onDeleteNickname\?: \(uid: string\) => void/);
  assert.match(settingsSource, /onSaveNickname\(uid, nickname\)/);
  assert.match(settingsSource, /onDeleteNickname\(uid\)/);
  const saveBlock = settingsSource.match(/const saveNicknameEntry[\s\S]*?^  };/m)?.[0] ?? "";
  const deleteBlock = settingsSource.match(/const deleteNickname[\s\S]*?^  };/m)?.[0] ?? "";
  assert.doesNotMatch(saveBlock, /voiceSettings\.setVoiceSettings/);
  assert.doesNotMatch(deleteBlock, /voiceSettings\.setVoiceSettings/);
  assert.match(workbenchSource, /onSaveNickname\?: \(uid: string, nickname: string\) => void/);
  assert.match(workbenchSource, /onDeleteNickname\?: \(uid: string\) => void/);
  assert.match(workbenchSource, /onSaveNickname=\{onSaveNickname\}/);
  assert.match(workbenchSource, /onDeleteNickname=\{onDeleteNickname\}/);
  assert.match(appSource, /const saveUserNickname = useCallback\(\(userOrUid: DanmakuUser \| string/);
  assert.match(appSource, /const deleteUserNickname = useCallback\(\(userOrUid: DanmakuUser \| string/);
  assert.match(appSource, /<MainArea[\s\S]*onSaveNickname=\{saveUserNickname\}/);
  assert.match(appSource, /<RightWorkbench[\s\S]*onSaveNickname=\{saveUserNickname\}/);
  assert.match(appSource, /archiveRepository\?\.setNickname\(uid/);
});

test("档案 Repository 先提供给会话，再独立尝试迁移", () => {
  const repositoryReadyIndex = appSource.indexOf("setArchiveRepository(repository)");
  const migrationAttemptIndex = appSource.indexOf("migrateLegacyFavorites(repository)");
  assert.ok(repositoryReadyIndex >= 0);
  assert.ok(migrationAttemptIndex >= 0);
  assert.ok(repositoryReadyIndex < migrationAttemptIndex);
  assert.match(appSource, /migrateLegacyFavorites\(repository\)[\s\S]*catch/);
});

test("启动先校正场次事件数，再开放主播档案，历史收益回算放到后台", () => {
  const eventCountRepairIndex = appSource.indexOf("repository.recomputeEventCounts()");
  const repositoryReadyIndex = appSource.indexOf("setArchiveRepository(repository)");
  const paidTotalRepairIndex = appSource.indexOf("repository.recomputePaidTotals()");

  assert.ok(eventCountRepairIndex >= 0);
  assert.ok(repositoryReadyIndex > eventCountRepairIndex);
  assert.ok(paidTotalRepairIndex > repositoryReadyIndex);
  assert.match(appSource, /void repository\.recomputePaidTotals\(\)[\s\S]*notifyArchiveRevision\(\)/);
});
