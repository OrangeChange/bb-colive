import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";
import { getArchiveDiagnosticSnapshot, resetArchiveDiagnosticSnapshot } from "../src/archive/archiveDiagnostics.ts";

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`无法加载待实现的档案传输模块 ${relativePath}: ${message}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const owner = {
  ownerId: "room:100",
  roomId: 100,
  uid: "anchor-100",
  name: "主播甲",
  avatarUrl: "https://img.example/anchor.png",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

const session = {
  sessionId: "session-100-1",
  ownerId: owner.ownerId,
  roomId: owner.roomId,
  title: "晚间直播",
  coverUrl: "https://img.example/session-cover.jpg",
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_003_600_000,
  status: "ended",
  quality: "complete",
  qualityReason: null,
  eventCount: 1,
  paidTotal: 2.5,
  favoriteCount: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_003_600_000,
};

const payloadJson = JSON.stringify({
  id: "event-1",
  msgType: 0,
  roomId: 100,
  ts: 1_700_000_001_000,
  text: "你好",
  user: {
    uid: "user-1",
    uname: "原始昵称",
    avatar: "https://img.example/user.png",
  },
  gift: {
    icon: "https://img.example/gift.png",
  },
});

const event = {
  eventKey: "session-100-1:archive-event:event-1",
  sessionId: session.sessionId,
  roomId: 100,
  ordinal: 0,
  eventTs: 1_700_000_001_000,
  primaryCategory: "danmu",
  secondaryCategory: "text",
  userUid: "user-1",
  userName: "原始昵称",
  searchText: "你好",
  payloadJson,
  sourceId: "local",
};

const snapshot = {
  owners: [owner],
  sessions: [{
    session,
    events: [event],
    favorites: [{
      eventKey: event.eventKey,
      sessionId: session.sessionId,
      favoritedAt: 1_700_000_002_000,
      note: "重点回看",
      tags: ["待复盘"],
    }],
    readingState: {
      sessionId: session.sessionId,
      eventKey: event.eventKey,
      fallbackEventTs: event.eventTs,
      sortDirection: "asc",
      filters: { favoriteOnly: true },
      searchScope: "session",
      updatedAt: 1_700_000_003_000,
    },
  }],
  nicknames: [{ userUid: "user-1", nickname: "常用昵称", updatedAt: 1_700_000_004_000 }],
  historicalFavorites: [],
};

class FakeTransferRepository {
  constructor({ snapshot: initialSnapshot = snapshot, deletePreview, failImport = false, blocked = 0 } = {}) {
    this.snapshot = clone(initialSnapshot);
    this.deletePreview = deletePreview ?? {
      sessionCount: 1,
      eventCount: 1,
      favoriteCount: 1,
      resourceReferenceCount: 3,
      bytes: 512,
      blockedSessionCount: blocked,
      blockedSessionIds: blocked > 0 ? [session.sessionId] : [],
      blockedSessionStates: blocked > 0 ? [{ sessionId: session.sessionId, status: "active" }] : [],
      sessionIds: blocked > 0 ? [] : [session.sessionId],
      sessionSnapshots: [{
        sessionId: session.sessionId,
        ownerId: session.ownerId,
        status: blocked > 0 ? "active" : session.status,
        updatedAt: session.updatedAt,
        quality: blocked > 0 ? "in-progress" : session.quality,
      }],
    };
    this.failImport = failImport;
    this.deleteScopes = [];
    this.deletedScopes = [];
    this.importPlans = [];
    this.transferScopes = [];
  }

  async getTransferSnapshot(scope) {
    this.transferScopes.push(scope);
    return clone(this.snapshot);
  }

  async getSession(sessionId) {
    return this.snapshot.sessions.find((entry) => entry.session.sessionId === sessionId)?.session ?? null;
  }

  async getEvent(eventKey) {
    for (const entry of this.snapshot.sessions) {
      const found = entry.events.find((item) => item.eventKey === eventKey);
      if (found) return clone(found);
    }
    return null;
  }

  async getDeletePreview(scope) {
    this.deleteScopes.push(scope);
    return clone(this.deletePreview);
  }

  async deleteArchive(scope, sessionIds) {
    this.deletedScopes.push({ scope, sessionIds });
  }

  async commitArchiveImport(plan) {
    this.importPlans.push(plan);
    if (this.failImport) throw new Error("import transaction failed");
    return {
      ...plan.counts,
      sourceId: plan.sourceId,
    };
  }
}

async function exportBundle(service) {
  const bytes = await service.exportArchive({ kind: "owner", ownerId: owner.ownerId });
  return JSON.parse(new TextDecoder().decode(bytes));
}

test('新增状态字段序列化保留，导入运行状态收口且质量原因合并', async () => {
  const { ArchiveTransferService } = await loadModule('../src/archive/archiveTransfer.ts');
  const input = clone(snapshot);
  Object.assign(input.sessions[0].session, { status: 'active', endedAt: null, quality: 'incomplete',
    recordingStatus: 'reconnecting', stopReason: null, qualityReasons: ['live-start-not-captured', 'connection-error'] });
  const bundle = await exportBundle(new ArchiveTransferService({ repository: new FakeTransferRepository({ snapshot: input }) }));
  assert.equal(bundle.sessions[0].session.recordingStatus, 'reconnecting');
  assert.deepEqual(bundle.sessions[0].session.qualityReasons, ['live-start-not-captured', 'connection-error']);
  const empty = new FakeTransferRepository({ snapshot: { ...clone(snapshot), sessions: [] } });
  const service = new ArchiveTransferService({ repository: empty });
  const preview = await service.previewImportArchive(bundle);
  await service.commitImportArchive(preview.previewId, preview.previewId);
  const imported = empty.importPlans[0].sessionCreates[0];
  assert.equal(imported.recordingStatus, 'stopped');
  assert.equal(imported.status, 'unclean');
  assert.deepEqual(imported.qualityReasons, ['live-start-not-captured', 'connection-error']);
  const local = clone(input);
  Object.assign(local.sessions[0].session, { recordingStatus: 'recording', qualityReasons: ['connection-switched'] });
  const repository = new FakeTransferRepository({ snapshot: local });
  const merge = new ArchiveTransferService({ repository });
  const mergePreview = await merge.previewImportArchive(bundle);
  await merge.commitImportArchive(mergePreview.previewId, mergePreview.previewId);
  const patch = repository.importPlans[0].sessionPatches[0];
  assert.deepEqual(patch.qualityReasons, ['connection-switched', 'live-start-not-captured', 'connection-error']);
  assert.equal(patch.recordingStatus, undefined);
  assert.equal(patch.stopReason, undefined);
  const stoppedInput = clone(input);
  Object.assign(stoppedInput.sessions[0].session, { status: 'unclean', recordingStatus: 'stopped', stopReason: 'manual-disconnect' });
  const stoppedBundle = await exportBundle(new ArchiveTransferService({ repository: new FakeTransferRepository({ snapshot: stoppedInput }) }));
  const stoppedRepository = new FakeTransferRepository({ snapshot: { ...clone(snapshot), sessions: [] } });
  const stoppedService = new ArchiveTransferService({ repository: stoppedRepository });
  const stoppedPreview = await stoppedService.previewImportArchive(stoppedBundle);
  await stoppedService.commitImportArchive(stoppedPreview.previewId, stoppedPreview.previewId);
  assert.equal(stoppedRepository.importPlans[0].sessionCreates[0].stopReason, 'manual-disconnect');
});

test('旧 schema 5 未结束档案缺字段时按未知停止导入', async () => {
  const { ArchiveTransferService } = await loadModule('../src/archive/archiveTransfer.ts');
  const bundle = await exportBundle(new ArchiveTransferService({ repository: new FakeTransferRepository() }));
  bundle.schemaVersion = bundle.manifest.schemaVersion = 5;
  Object.assign(bundle.sessions[0].session, { status: 'active', endedAt: null, quality: 'incomplete', qualityReason: 'start-time-unknown' });
  for (const key of ['recordingStatus', 'qualityReasons', 'stopReason']) delete bundle.sessions[0].session[key];
  const repository = new FakeTransferRepository({ snapshot: { ...clone(snapshot), sessions: [] } });
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewImportArchive(bundle);
  await service.commitImportArchive(preview.previewId, preview.previewId);
  const imported = repository.importPlans[0].sessionCreates[0];
  assert.equal(imported.status, 'unclean');
  assert.equal(imported.recordingStatus, 'stopped');
  assert.equal(imported.quality, 'in-progress');
  assert.deepEqual(imported.qualityReasons, []);
});

for (const [name, quality, qualityReason, offset, expectedQuality, expectedReasons, expectedStopReason] of [
  ['晚连接与进程遗留', 'incomplete', 'previous-runtime', 10000, 'incomplete', ['live-start-not-captured'], 'previous-runtime'],
  ['晚连接与其他缺口', 'incomplete', 'connection-switched', 10000, 'incomplete', ['live-start-not-captured', 'connection-switched'], 'connection-switched'],
  ['旧完整场次明确晚连接', 'complete', null, 10000, 'incomplete', ['live-start-not-captured'], null],
  ['旧完整场次容差内', 'complete', null, 5000, 'complete', [], null],
  ['旧完整场次超过容差', 'complete', null, 5001, 'incomplete', ['live-start-not-captured'], null],
  ['旧完整场次无时间证据', 'complete', null, null, 'complete', [], null],
]) {
  test(`旧档案导入时间证据：${name}`, async () => {
    const { ArchiveTransferService } = await loadModule('../src/archive/archiveTransfer.ts');
    const bundle = await exportBundle(new ArchiveTransferService({ repository: new FakeTransferRepository() }));
    bundle.schemaVersion = bundle.manifest.schemaVersion = 7;
    const raw = bundle.sessions[0].session;
    Object.assign(raw, { quality, qualityReason, sourceLiveStartedAt: offset === null ? null : raw.startedAt - offset });
    for (const key of ['recordingStatus', 'stopReason', 'qualityReasons']) delete raw[key];
    const repository = new FakeTransferRepository({ snapshot: { ...clone(snapshot), sessions: [] } });
    const service = new ArchiveTransferService({ repository });
    const preview = await service.previewImportArchive(bundle);
    await service.commitImportArchive(preview.previewId, preview.previewId);
    const imported = repository.importPlans[0].sessionCreates[0];
    assert.equal(imported.quality, expectedQuality);
    assert.deepEqual(imported.qualityReasons, expectedReasons);
    assert.equal(imported.qualityReason, qualityReason);
    assert.equal(imported.stopReason, expectedStopReason);
    assert.equal(imported.recordingStatus, 'stopped');
    assert.equal(imported.startedAt, raw.startedAt);
    assert.equal(imported.sourceLiveStartedAt, raw.sourceLiveStartedAt);
    assert.equal(imported.endedAt, raw.endedAt);
  });
}

test("完整导出保留 raw payload、URL、收藏、昵称、阅读状态和 manifest，但不含二进制/本地路径", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });

  const bundle = await exportBundle(service);

  assert.equal(bundle.format, "danmu-archive");
  assert.equal(bundle.formatVersion, 1);
  assert.equal(bundle.schemaVersion, 9);
  assert.equal(bundle.manifest.featureId, "review-archive");
  assert.equal(bundle.manifest.featureVersion, 1);
  assert.deepEqual(bundle.manifest.sourceSummary, {
    sourceCount: 1,
    missingCount: 0,
    conflictCount: 0,
  });
  assert.equal(bundle.manifest.restorable, true);
  assert.equal(bundle.manifest.resourcePolicy.binariesIncluded, false);
  assert.equal(bundle.manifest.resourcePolicy.urlsIncluded, true);
  assert.deepEqual(bundle.manifest.resourceUrls.sort(), [
    "https://img.example/anchor.png",
    "https://img.example/gift.png",
    "https://img.example/session-cover.jpg",
    "https://img.example/user.png",
  ]);
  assert.equal(bundle.sessions[0].session.coverUrl, "https://img.example/session-cover.jpg");
  assert.equal(bundle.sessions[0].events[0].payloadJson, payloadJson);
  assert.match(bundle.sessions[0].events[0].payloadJson, /https:\/\/img\.example\/gift\.png/);
  assert.equal(bundle.sessions[0].favorites[0].eventKey, event.eventKey);
  assert.equal(bundle.sessions[0].favorites[0].note, "重点回看");
  assert.deepEqual(bundle.sessions[0].favorites[0].tags, ["待复盘"]);
  assert.equal(bundle.nicknames[0].nickname, "常用昵称");
  assert.equal(bundle.sessions[0].readingState.eventKey, event.eventKey);
  assert.equal("markers" in bundle, false);
  assert.equal("imageBytes" in bundle, false);
  assert.equal("localPath" in bundle, false);
  assert.equal("diagnostics" in bundle, false);
  assert.equal("credentials" in bundle, false);
  assert.equal("settings" in bundle, false);
});

test("旧 schema 4 档案包缺少备注和标签时仍可预览导入", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const exported = JSON.parse(new TextDecoder().decode(
    await new ArchiveTransferService({ repository: new FakeTransferRepository() })
      .exportArchive({ kind: "owner", ownerId: owner.ownerId }),
  ));
  exported.schemaVersion = 4;
  exported.manifest.schemaVersion = 4;
  delete exported.sessions[0].favorites[0].note;
  delete exported.sessions[0].favorites[0].tags;
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });
  const preview = await service.previewImportArchive(exported);
  assert.equal(preview.previewId.startsWith("archive-import-"), true);
});

test("导入时空封面可以补入，已有本地封面不会被外部覆盖", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const exported = JSON.parse(new TextDecoder().decode(
    await new ArchiveTransferService({ repository: new FakeTransferRepository() })
      .exportArchive({ kind: "owner", ownerId: owner.ownerId }),
  ));

  const emptySnapshot = clone(snapshot);
  emptySnapshot.sessions[0].session.coverUrl = null;
  const emptyRepository = new FakeTransferRepository({ snapshot: emptySnapshot });
  const emptyService = new ArchiveTransferService({ repository: emptyRepository });
  const emptyPreview = await emptyService.previewImportArchive(exported);
  await emptyService.commitImportArchive(emptyPreview.previewId, emptyPreview.previewId);
  assert.equal(emptyRepository.importPlans[0].sessionPatches[0].coverUrl, "https://img.example/session-cover.jpg");

  const localSnapshot = clone(snapshot);
  localSnapshot.sessions[0].session.coverUrl = "https://img.example/local-cover.jpg";
  const external = clone(exported);
  external.sessions[0].session.coverUrl = "https://img.example/external-cover.jpg";
  external.manifest.resourceUrls = [
    "https://img.example/anchor.png",
    "https://img.example/external-cover.jpg",
    "https://img.example/gift.png",
    "https://img.example/user.png",
  ];
  const localRepository = new FakeTransferRepository({ snapshot: localSnapshot });
  const localService = new ArchiveTransferService({ repository: localRepository });
  const localPreview = await localService.previewImportArchive(external);
  await localService.commitImportArchive(localPreview.previewId, localPreview.previewId);
  assert.equal(localRepository.importPlans[0].sessionPatches.some((patch) => "coverUrl" in patch), false);
});

test("导出提供文本接口，供路径命令直接写入而不复制 Uint8Array", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });

  const content = await service.exportArchiveText({ kind: "owner", ownerId: owner.ownerId });
  const bundle = JSON.parse(content);

  assert.equal(bundle.format, "danmu-archive");
  assert.equal(typeof content, "string");
});

test("按日期范围导出使用包含结束日期当天的半开时间范围", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const fromTs = 1_700_000_000_000;
  const toTs = fromTs + 86_400_000;
  const bundle = JSON.parse(await service.exportArchiveText({ kind: "date", fromTs, toTs }));
  assert.equal(bundle.manifest.scope, "date");
  assert.deepEqual(repository.transferScopes, [{ kind: "date", fromTs, toTs }]);
});

test("一次档案导出贯穿同一 requestId 且 action snapshot 只计一次", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  resetArchiveDiagnosticSnapshot();
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-transfer-request-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });
  const requestId = "archive-export-request-1";
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });

  await service.exportArchiveText({ kind: "owner", ownerId: owner.ownerId }, { requestId });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const exportRecords = records.filter((record) => record.action === "archive-export");
  assert.ok(exportRecords.length >= 2);
  assert.deepEqual([...new Set(exportRecords.map((record) => record.requestId))], [requestId]);
  const snapshot = getArchiveDiagnosticSnapshot();
  assert.equal(snapshot.actions.export.requested, 1);
  assert.equal(snapshot.actions.export.succeeded, 1);
});

test("结果导出明确不可完整还原", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });

  const bytes = await service.exportArchive({ kind: "result", eventKeys: [event.eventKey] });
  const bundle = JSON.parse(new TextDecoder().decode(bytes));

  assert.equal(bundle.manifest.restorable, false);
  assert.equal(bundle.manifest.scope, "result");
});

test("资源 URL 提取递归解析 escaped JSON，并按唯一 URL 返回", async () => {
  const { archiveResourceUrls } = await loadModule("../src/archive/archiveResourceUrls.ts");

  assert.deepEqual(
    archiveResourceUrls('{"urls":["https:\\/\\/img.example\\/escaped.png","https://img.example/escaped.png"]}'),
    ["https://img.example/escaped.png"],
  );
});

test("导入严格校验 manifest 字段允许值和内容一致性", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const cases = [
    ["scope", (bundle) => { bundle.manifest.scope = "unknown"; }],
    ["restorable scope", (bundle) => { bundle.manifest.scope = "result"; bundle.manifest.restorable = true; }],
    ["exportedAt", (bundle) => { bundle.manifest.exportedAt = "now"; }],
    ["cacheStrategy", (bundle) => { bundle.manifest.resourcePolicy.cacheStrategy = "network-only"; }],
    ["resource URL scheme", (bundle) => { bundle.manifest.resourceUrls = ["ftp://img.example/a.png"]; }],
    ["resource URL content", (bundle) => { bundle.manifest.resourceUrls = []; }],
    ["resource URL type", (bundle) => { bundle.manifest.resourceUrls = "https://img.example/a.png"; }],
    ["fractional count", (bundle) => { bundle.manifest.counts.eventCount = 1.5; }],
  ];

  for (const [label, mutate] of cases) {
    const sourceService = new ArchiveTransferService({ repository: new FakeTransferRepository() });
    const bundle = await exportBundle(sourceService);
    mutate(bundle);
    const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });
    await assert.rejects(
      () => service.previewImportArchive(bundle),
      /档案包|manifest|resource|scope|count/i,
      label,
    );
  }
});

test("导入默认按稳定 eventKey 幂等，重复跳过，新事件加入计划", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const bundle = await exportBundle(service);
  bundle.sessions[0].events.push({
    ...event,
    eventKey: "session-100-1:archive-event:event-2",
    ordinal: 1,
    eventTs: event.eventTs + 1,
    payloadJson: JSON.stringify({ id: "event-2", roomId: 100, ts: event.eventTs + 1, text: "新事件" }),
  });
  bundle.sessions[0].session.eventCount = 2;
  bundle.manifest.counts = { ...bundle.manifest.counts, eventCount: 2 };

  const preview = await service.previewImportArchive(bundle);

  assert.equal(preview.newEvents, 1);
  assert.equal(preview.skipped, 1);
  assert.equal(preview.conflicts, 0);
  await service.commitImportArchive(preview.previewId, preview.previewId);
  assert.equal(repository.importPlans.length, 1);
  assert.deepEqual(repository.importPlans[0].newEvents.map((item) => item.eventKey), ["session-100-1:archive-event:event-2"]);
});

test("同一 eventKey 的不同 raw payload 记为 conflict，且不覆盖本地 payload", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const bundle = await exportBundle(service);
  bundle.sessions[0].events[0] = {
    ...bundle.sessions[0].events[0],
    payloadJson: JSON.stringify({ ...JSON.parse(payloadJson), text: "外部冲突内容" }),
  };

  const preview = await service.previewImportArchive(bundle);

  assert.equal(preview.newEvents, 0);
  assert.equal(preview.skipped, 0);
  assert.equal(preview.conflicts, 1);
  await service.commitImportArchive(preview.previewId, preview.previewId);
  assert.equal(repository.importPlans[0].newEvents.length, 0);
  assert.equal(repository.snapshot.sessions[0].events[0].payloadJson, payloadJson);
});

test("导入确认 token 不匹配时不写入，事务失败向上抛出并保留回滚语义", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository({ failImport: true });
  const service = new ArchiveTransferService({ repository });
  const bundle = await exportBundle(service);
  const preview = await service.previewImportArchive(bundle);

  await assert.rejects(
    () => service.commitImportArchive(preview.previewId, "wrong-confirmation"),
    /confirmation/i,
  );
  await assert.rejects(
    () => service.commitImportArchive(preview.previewId, preview.previewId),
    /import transaction failed/,
  );
  assert.equal(repository.snapshot.sessions[0].events.length, 1);
});

test("放弃导入和删除预览会记录 cancel 并丢弃待确认计划", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  resetArchiveDiagnosticSnapshot();
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });
  const bundle = await exportBundle(service);

  const importRequestId = "archive-import-request-1";
  const importPreview = await service.previewImportArchive(bundle, { requestId: importRequestId });
  service.cancelImportPreview(importPreview.previewId, importRequestId);
  await assert.rejects(
    () => service.commitImportArchive(importPreview.previewId, importPreview.previewId, { requestId: importRequestId }),
    /预览已过期|expired/i,
  );

  const deleteRequestId = "archive-delete-request-1";
  const deletePreview = await service.previewDelete({ sessionId: session.sessionId }, { requestId: deleteRequestId });
  service.cancelDeletePreview(deletePreview.previewId, deleteRequestId);
  await assert.rejects(
    () => service.deleteArchive(deletePreview.previewId, deletePreview.previewId, { requestId: deleteRequestId }),
    /预览已过期|expired/i,
  );

  const snapshot = getArchiveDiagnosticSnapshot();
  assert.equal(snapshot.actions.import.canceled, 1);
  assert.equal(snapshot.actions.delete.canceled, 1);
});

test("删除提交把 requestId 传给 writer 的 session block 控制", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const calls = [];
  const service = new ArchiveTransferService({
    repository,
    runArchiveTransfer: async (operation) => operation({
      blockSessions: (sessionIds, requestId) => calls.push({ sessionIds, requestId }),
    }),
  });
  const requestId = "archive-delete-request-2";
  const preview = await service.previewDelete({ sessionId: session.sessionId }, { requestId });
  await service.deleteArchive(preview.previewId, preview.previewId, { requestId });

  assert.deepEqual(calls, [{ sessionIds: [session.sessionId], requestId }]);
});

test("导入和删除确认共享 archive transfer lock", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const sourceBundle = await exportBundle(new ArchiveTransferService({ repository: new FakeTransferRepository() }));
  const repository = new FakeTransferRepository();
  const lockEvents = [];
  const service = new ArchiveTransferService({
    repository,
    runArchiveTransfer: async (operation) => {
      lockEvents.push("enter");
      const result = await operation({
        blockSessions: (sessionIds) => lockEvents.push(`block:${sessionIds.join(",")}`),
      });
      lockEvents.push("exit");
      return result;
    },
  });

  const importPreview = await service.previewImportArchive(sourceBundle);
  await service.commitImportArchive(importPreview.previewId, importPreview.previewId);
  const deletePreview = await service.previewDelete({ sessionId: session.sessionId });
  await service.deleteArchive(deletePreview.previewId, deletePreview.previewId);

  assert.deepEqual(lockEvents, [
    "enter", "exit",
    "enter", "exit",
    "enter", `block:${session.sessionId}`, "exit",
  ]);
});

test("删除预览透传 owner/周期与单场边界，并在确认后才级联删除收藏所属档案", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });

  const before = await service.previewDelete({ ownerId: owner.ownerId, beforeTs: 1_700_010_000_000 });
  assert.equal(before.sessionCount, 1);
  assert.equal(before.eventCount, 1);
  assert.equal(before.favoriteCount, 1);
  assert.equal(before.resourceReferenceCount, 3);
  assert.equal(repository.deletedScopes.length, 0);
  await service.deleteArchive(before.previewId, before.previewId);
  assert.deepEqual(repository.deletedScopes[0], {
    scope: { ownerId: owner.ownerId, beforeTs: 1_700_010_000_000 },
    sessionIds: [session.sessionId],
  });

  const range = await service.previewDelete({ ownerId: owner.ownerId, fromTs: 1_700_000_000_000, toTs: 1_700_004_000_000 });
  assert.deepEqual(repository.deleteScopes.at(-1), {
    ownerId: owner.ownerId,
    fromTs: 1_700_000_000_000,
    toTs: 1_700_004_000_000,
  });
  const single = await service.previewDelete({ sessionId: session.sessionId });
  assert.deepEqual(repository.deleteScopes.at(-1), { sessionId: session.sessionId });
  await assert.rejects(() => service.deleteArchive(single.previewId, "wrong-confirmation"), /confirmation/i);
  assert.equal(repository.deletedScopes.length, 1);
  assert.equal(range.sessionCount, 1);
});

test("删除确认只处理预览 session 集合，新增匹配场次时要求重新预览", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ ownerId: owner.ownerId, beforeTs: 1_700_010_000_000 });

  repository.deletePreview = {
    ...repository.deletePreview,
    sessionIds: [session.sessionId, "session-new"],
    sessionCount: 2,
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("删除确认检测 active 与 unclean 状态变化", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository({ blocked: 1 });
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  repository.deletePreview = {
    ...repository.deletePreview,
    blockedSessionStates: [{ sessionId: session.sessionId, status: "unclean" }],
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("删除确认检测目标从 ended 变为 active", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  repository.deletePreview = {
    ...repository.deletePreview,
    sessionSnapshots: [{
      ...repository.deletePreview.sessionSnapshots[0],
      status: "active",
      quality: "in-progress",
      updatedAt: session.updatedAt + 1,
    }],
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("删除确认检测目标从 ended 变为 unclean", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  repository.deletePreview = {
    ...repository.deletePreview,
    sessionSnapshots: [{
      ...repository.deletePreview.sessionSnapshots[0],
      status: "unclean",
      quality: "incomplete",
      updatedAt: session.updatedAt + 1,
    }],
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("unclean 场次与 ended 一样可以在二次确认后删除", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository({
    deletePreview: {
      sessionCount: 1,
      eventCount: 1,
      favoriteCount: 1,
      resourceReferenceCount: 0,
      bytes: 128,
      blockedSessionCount: 0,
      blockedSessionIds: [],
      blockedSessionStates: [],
      sessionIds: [session.sessionId],
      sessionSnapshots: [{
        sessionId: session.sessionId,
        ownerId: session.ownerId,
        status: "unclean",
        updatedAt: session.updatedAt,
        quality: "incomplete",
      }],
    },
  });
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  await service.deleteArchive(preview.previewId, preview.previewId);

  assert.equal(repository.deletedScopes.length, 1);
});

test("删除确认检测目标 owner 变化", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  repository.deletePreview = {
    ...repository.deletePreview,
    sessionSnapshots: [{
      ...repository.deletePreview.sessionSnapshots[0],
      ownerId: "room:changed",
    }],
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("删除确认检测阻塞场次计数变化", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  repository.deletePreview = {
    ...repository.deletePreview,
    blockedSessionCount: 1,
  };

  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /重新预览|preview/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("进行中场次在删除确认阶段被拒绝", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository({ blocked: 1 });
  const service = new ArchiveTransferService({ repository });
  const preview = await service.previewDelete({ sessionId: session.sessionId });

  assert.equal(preview.blockedSessionCount, 1);
  await assert.rejects(
    () => service.deleteArchive(preview.previewId, preview.previewId),
    /进行中|未正常结束|cannot delete/i,
  );
  assert.equal(repository.deletedScopes.length, 0);
});

test("删除范围必须有明确边界，日期范围不可反向", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });

  await assert.rejects(() => service.previewDelete({}), /scope|范围|边界/i);
  await assert.rejects(
    () => service.previewDelete({ fromTs: 10, toTs: 10 }),
    /fromTs|范围|before/i,
  );
});

test("删除预览支持精确的多场次集合，并把集合传递到确认删除", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });

  const preview = await service.previewDelete({
    ownerId: owner.ownerId,
    sessionIds: [session.sessionId, "session-100-2"],
  });
  await service.deleteArchive(preview.previewId, preview.previewId);

  assert.deepEqual(repository.deleteScopes[0], {
    ownerId: owner.ownerId,
    sessionIds: [session.sessionId, "session-100-2"],
  });
  assert.deepEqual(repository.deletedScopes[0].sessionIds, [session.sessionId]);
});

test("删除主播全部档案需要显式 ownerAll，并拒绝混用日期边界", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });
  await service.previewDelete({ ownerId: owner.ownerId, ownerAll: true });
  assert.deepEqual(repository.deleteScopes, [{ ownerId: owner.ownerId, ownerAll: true }]);
  await assert.rejects(
    () => service.previewDelete({ ownerId: owner.ownerId, ownerAll: true, beforeTs: 10 }),
    /不能同时指定|owner|范围/i,
  );
  await service.previewDelete({ keepOnlyOwnerId: owner.ownerId });
  assert.deepEqual(repository.deleteScopes.at(-1), { keepOnlyOwnerId: owner.ownerId });
  await assert.rejects(
    () => service.previewDelete({ keepOnlyOwnerId: owner.ownerId, fromTs: 10, toTs: 20 }),
    /不能同时指定|范围/i,
  );
});

test("删除全部档案使用显式 all 范围，并拒绝与其他范围混用", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository();
  const service = new ArchiveTransferService({ repository });

  await service.previewDelete({ all: true });
  assert.deepEqual(repository.deleteScopes, [{ all: true }]);
  await assert.rejects(
    () => service.previewDelete({ all: true, beforeTs: 10 }),
    /不能同时指定|范围/i,
  );
});

test("新场次导入计入 imported，并把收藏与阅读状态一起放入事务计划", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const repository = new FakeTransferRepository({ snapshot: {
    owners: [owner],
    sessions: [],
    nicknames: [],
    historicalFavorites: [],
  }});
  const service = new ArchiveTransferService({ repository });
  const sourceService = new ArchiveTransferService({ repository: new FakeTransferRepository() });
  const bundle = await exportBundle(sourceService);
  bundle.manifest.counts = {
    ...bundle.manifest.counts,
    sessionCount: 1,
    eventCount: 1,
    favoriteCount: 1,
    nicknameCount: 1,
    readingStateCount: 1,
  };

  const preview = await service.previewImportArchive(bundle);

  assert.equal(preview.imported, 1);
  assert.equal(preview.newEvents, 1);
  assert.equal(preview.skipped, 0);
  await service.commitImportArchive(preview.previewId, preview.previewId);
  const plan = repository.importPlans[0];
  assert.deepEqual(plan.newEvents.map((item) => item.eventKey), [event.eventKey]);
  assert.deepEqual(plan.favorites.map((item) => item.eventKey), [event.eventKey]);
  assert.deepEqual(plan.readingStates.map((item) => item.eventKey), [event.eventKey]);
});

test("导入拒绝重复 eventKey 和跨 session 的收藏关联", async () => {
  const { ArchiveTransferService } = await loadModule("../src/archive/archiveTransfer.ts");
  const service = new ArchiveTransferService({ repository: new FakeTransferRepository() });
  const duplicate = await exportBundle(service);
  duplicate.sessions[0].events.push({ ...event, ordinal: 1, eventTs: event.eventTs + 1 });
  await assert.rejects(() => service.previewImportArchive(duplicate), /重复 eventKey/);

  const invalidFavorite = await exportBundle(service);
  invalidFavorite.sessions[0].favorites[0].sessionId = "other-session";
  await assert.rejects(() => service.previewImportArchive(invalidFavorite), /session 关联不一致/);
});
