import assert from "node:assert/strict";
import test from "node:test";

import {
  getArchiveDiagnosticSnapshot,
  recordArchiveDiagnostic,
  recordArchiveProjection,
  recordArchiveRender,
  recordArchiveSourceEvent,
  resetArchiveDiagnosticSnapshot,
  updateArchiveReviewState,
} from "../src/archive/archiveDiagnostics.ts";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";

test("archive 诊断汇总保留 source/projected/render 计数和 review 上下文", () => {
  resetArchiveDiagnosticSnapshot();
  recordArchiveSourceEvent("source:connect-1:1");
  recordArchiveSourceEvent("source:connect-1:2");
  recordArchiveProjection(2, ["event-1", "event-2"]);
  recordArchiveRender(1, ["event-1"]);
  updateArchiveReviewState({
    route: "session/session-1",
    hasSearchText: true,
    filterKeys: ["primaryCategories", "favoriteOnly"],
    searchScope: "session",
    sortField: "eventCount",
    sortDirection: "desc",
    readingEventKey: "event-1",
  });

  const snapshot = getArchiveDiagnosticSnapshot();
  assert.equal(snapshot.source.rawEventCount, 2);
  assert.equal(snapshot.projected.count, 2);
  assert.equal(snapshot.render.count, 1);
  assert.deepEqual(snapshot.review.query.filterKeys, ["favoriteOnly", "primaryCategories"]);
  assert.equal(snapshot.review.readingEventKey, "event-1");
  assert.deepEqual(snapshot.render.sampleRefs, ["event-1"]);
});

test("回看诊断快照明确覆盖主播模式、条件、检索统计和结果定位", () => {
  resetArchiveDiagnosticSnapshot();
  updateArchiveReviewState({
    ownerMode: "events",
    ownerSessionFilterKeys: ["favoriteOnly", "title"],
    ownerEventFilterKeys: ["favoriteOnly", "keywordConditions"],
    ownerEventSearch: { groupCount: 4, matchCount: 17, durationMs: 83 },
    ownerEventResultFound: false,
  });

  const review = getArchiveDiagnosticSnapshot().review;
  assert.equal(review.ownerMode, "events");
  assert.deepEqual(review.ownerSessionFilters.activeKeys, ["favoriteOnly", "title"]);
  assert.deepEqual(review.ownerEventSearch, {
    activeFilterKeys: ["favoriteOnly", "keywordConditions"],
    groupCount: 4,
    matchCount: 17,
    durationMs: 83,
  });
  assert.deepEqual(review.ownerEventResultNavigation, { count: 1, lastTargetFound: false });
});

test("archive 生命周期记录动作汇总，失败带 source/render correlation 且不抛出", async () => {
  resetArchiveDiagnosticSnapshot();
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-diagnostic-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });

  assert.doesNotThrow(() => {
    recordArchiveDiagnostic("request", "archive-export", "started", {
      requestId: "request-1",
      count: 2,
      pathProvided: true,
      stream: "source",
      data: { phase: "snapshot" },
    });
    recordArchiveDiagnostic("failure", "archive-export", "failed", {
      requestId: "request-1",
      data: { phase: "write" },
    });
  });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const failure = records.find((record) => record.action === "archive-export" && record.outcome === "failed");
  assert.equal(failure.data.sourceRef, "archive-source:archive-export");
  assert.equal(failure.data.renderRef, "archive-render:archive-export");
  assert.equal(getArchiveDiagnosticSnapshot().actions.export.failed, 1);
  assert.equal(getArchiveDiagnosticSnapshot().actions.export.lastPathProvided, true);
});

test("主播事件检索诊断记录分组与命中数量，不记录关键词正文", async () => {
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-owner-event-search-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });

  recordArchiveDiagnostic("success", "archive-query", "completed", {
    requestId: "owner-event-search-1",
    stream: "source",
    count: 2,
    data: {
      phase: "owner-event-search",
      ownerId: "room:12345",
      groupCount: 2,
      matchCount: 7,
      activeFilterKeys: "favoriteOnly,keywordConditions",
      durationMs: 31,
    },
  });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const search = records.find((record) => record.requestId === "owner-event-search-1");
  assert.equal(search.data.phase, "owner-event-search");
  assert.equal(search.data.groupCount, 2);
  assert.equal(search.data.matchCount, 7);
  assert.equal(search.data.durationMs, 31);
  assert.equal(Object.hasOwn(search.data, "keyword"), false);
  assert.equal(Object.hasOwn(search.data, "keywordText"), false);
});

test("同一 requestId 的 UI/service 生命周期在 action snapshot 中只计一次", () => {
  resetArchiveDiagnosticSnapshot();
  const requestId = "archive-export-request-1";

  recordArchiveDiagnostic("request", "archive-export", "started", { requestId, data: { phase: "ui-start" } });
  recordArchiveDiagnostic("request", "archive-export", "started", { requestId, data: { phase: "service-start" } });
  recordArchiveDiagnostic("success", "archive-export", "written", { requestId, data: { phase: "service-success" } });
  recordArchiveDiagnostic("success", "archive-export", "written", { requestId, data: { phase: "ui-success" } });

  const snapshot = getArchiveDiagnosticSnapshot();
  assert.equal(snapshot.actions.export.requested, 1);
  assert.equal(snapshot.actions.export.succeeded, 1);
  assert.equal(snapshot.actions.export.failed, 0);
  assert.equal(snapshot.actions.export.canceled, 0);
});

test("业务数据导出诊断记录范围、格式和条数，但不记录完整文件路径或正文", async () => {
  resetArchiveDiagnosticSnapshot();
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-data-export-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });

  recordArchiveDiagnostic("request", "archive-data-export", "started", {
    requestId: "data-export-1",
    pathProvided: true,
    data: { phase: "collect", format: "csv", scope: "owner", categoryCount: 5 },
  });
  recordArchiveDiagnostic("success", "archive-data-export", "written", {
    requestId: "data-export-1",
    count: 23,
    pathProvided: true,
    data: { phase: "write", format: "csv", scope: "owner", categoryCount: 5 },
  });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const success = records.find((record) => record.requestId === "data-export-1" && record.outcome === "written");
  assert.equal(success.data.format, "csv");
  assert.equal(success.data.scope, "owner");
  assert.equal(success.data.count, 23);
  assert.equal(Object.hasOwn(success.data, "path"), false);
  assert.equal(Object.hasOwn(success.data, "keyword"), false);
  assert.equal(getArchiveDiagnosticSnapshot().actions.export.succeeded, 1);
});
