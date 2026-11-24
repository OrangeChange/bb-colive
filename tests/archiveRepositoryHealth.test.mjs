import assert from "node:assert/strict";
import test from "node:test";

test("archive repository 暴露 schema、统计和数据库大小健康快照", async () => {
  const { ArchiveRepository } = await import("../src/archive/archiveRepository.ts");
  let statsQuery = "";
  const database = {
    execute: async () => ({ rowsAffected: 0 }),
    select: async (query) => {
      if (query.includes("user_version")) return [{ user_version: 1 }];
      if (query.includes("page_count")) return [{ page_count: 2 }];
      if (query.includes("page_size")) return [{ page_size: 4096 }];
      statsQuery = query;
      return [{
        ownerCount: 1,
        sourceCount: 2,
        sessionCount: 3,
        eventCount: 20,
        favoriteCount: 4,
        nicknameCount: 5,
        readingStateCount: 2,
      }];
    },
  };
  const health = await new ArchiveRepository(database).getHealthSnapshot();
  assert.match(statsQuery, /archive_owner[\s\S]*EXISTS\s*\(\s*SELECT 1\s+FROM archive_session/i);
  assert.deepEqual(health, {
    available: true,
    schemaVersion: 1,
    ownerCount: 1,
    sourceCount: 2,
    sessionCount: 3,
    eventCount: 20,
    favoriteCount: 4,
    nicknameCount: 5,
    readingStateCount: 2,
    pageCount: 2,
    pageSize: 4096,
    bytes: 8192,
    error: null,
  });
});

test("archive health 查询失败时返回不可用快照而不是阻断诊断导出", async () => {
  const { ArchiveRepository } = await import("../src/archive/archiveRepository.ts");
  const health = await new ArchiveRepository({
    execute: async () => ({ rowsAffected: 0 }),
    select: async () => { throw new Error("database unavailable"); },
  }).getHealthSnapshot();
  assert.equal(health.available, false);
  assert.match(health.error, /database unavailable/);
});
