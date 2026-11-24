import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteAdapter } from './helpers/archiveAcceptance.mjs';

async function temporarySqlite(t, version = 8) {
  const { ARCHIVE_SCHEMA_STATEMENTS, initializeArchiveDatabase } = await import('../src/archive/archiveSchema.ts');
  const path = join(mkdtempSync(join(tmpdir(), 'danmu-state-')), 'archive.sqlite');
  t.diagnostic(`SQLite fixture: ${path}`);
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  for (let sql of ARCHIVE_SCHEMA_STATEMENTS) {
    if (/PRAGMA user_version/.test(sql)) continue;
    if (version === 7) sql = sql.replace(/^\s*(recording_status|stop_reason|quality_reasons)\s+.*\n/gm, '');
    db.exec(sql);
  }
  db.exec(`PRAGMA user_version = ${version}`);
  const adapter = sqliteAdapter(db);
  if (version !== 7) await initializeArchiveDatabase(adapter);
  db.exec("INSERT INTO archive_owner VALUES ('owner', 1, 'uid', 'name', NULL, 100, 200)");
  return { db, adapter, initializeArchiveDatabase, path };
}

test('schema 7 真实 SQLite 迁移保留内容与统计，两次执行一致', async (t) => {
  const { db, adapter, initializeArchiveDatabase } = await temporarySqlite(t, 7);
  const insert = db.prepare(`INSERT INTO archive_session
    (session_id, owner_id, room_id, started_at, ended_at, status, quality, quality_reason,
     source_live_started_at, event_count, paid_total, favorite_count, created_at, updated_at)
    VALUES (?, 'owner', 1, 1000000, ?, ?, ?, ?, ?, 7, 12.5, 1, 100, 200)`);
  for (const values of [
    ['active', null, 'active', 'in-progress', null, null],
    ['unknown', null, 'unclean', 'incomplete', 'start-time-unknown', null],
    ['runtime', null, 'unclean', 'incomplete', 'previous-runtime', null],
    ['runtime-late', null, 'unclean', 'incomplete', 'previous-runtime', 990000],
    ['complete-tolerance', 2000000, 'ended', 'complete', null, 995000],
    ['complete-over-tolerance', 2000000, 'ended', 'complete', null, 994999],
    ['late', 2000000, 'ended', 'incomplete', 'live-start-not-captured', 100],
    ['old-complete-late', 2000000, 'ended', 'complete', null, 100],
    ['complete', 2000000, 'ended', 'complete', null, 1000000],
    ['switched', null, 'unclean', 'incomplete', 'connection-switched', 100],
  ]) insert.run(...values);
  db.exec(`INSERT INTO archive_source VALUES ('source', 'import', 123, 1, 2, 3, 4);
    INSERT INTO archive_event VALUES ('event', 'unknown', 1, 0, 123, 'danmu', 'text', 'u', 'n', '正文', '{"text":"正文"}', 'source');
    INSERT INTO archive_event_source VALUES ('event', 'source');
    INSERT INTO archive_search_index VALUES ('event', 'unknown', '正文');
    INSERT INTO archive_favorite VALUES ('event', 'unknown', 456, '备注');
    INSERT INTO archive_favorite_tag VALUES (1, '标签', 123, 456);
    INSERT INTO archive_favorite_event_tag VALUES ('event', 1);
    INSERT INTO archive_historical_favorite VALUES ('legacy', 1, 'old', '{"text":"旧内容"}', 789, '历史收藏', '旧备注', '旧内容');
    INSERT INTO archive_historical_favorite_tag VALUES ('legacy', 1);
    INSERT INTO archive_reading_state VALUES ('unknown', 'event', 123, 'asc', '{}', 'session', 345);
    INSERT INTO archive_user_profile VALUES ('u', '昵称', 234);`);
  const tables = ['archive_owner', 'archive_event', 'archive_event_source', 'archive_source', 'archive_favorite',
    'archive_favorite_tag', 'archive_favorite_event_tag', 'archive_historical_favorite', 'archive_historical_favorite_tag',
    'archive_search_index', 'archive_reading_state', 'archive_user_profile'];
  const content = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const protectedColumns = `session_id, owner_id, room_id, started_at, ended_at, source_live_started_at,
    quality_reason, event_count, paid_total, favorite_count, created_at, updated_at`;
  const original = db.prepare(`SELECT ${protectedColumns} FROM archive_session ORDER BY session_id`).all();
  const before = content();
  await initializeArchiveDatabase(adapter);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
  assert.deepEqual(content(), before);
  assert.deepEqual(db.prepare(`SELECT ${protectedColumns} FROM archive_session ORDER BY session_id`).all(), original);
  const states = db.prepare('SELECT session_id, status, quality, recording_status, stop_reason, quality_reasons FROM archive_session ORDER BY session_id').all();
  const state = id => states.find(row => row.session_id === id);
  assert.equal(state('active').status, 'unclean');
  assert.equal(state('unknown').quality, 'in-progress');
  assert.equal(state('runtime').quality, 'in-progress');
  assert.equal(state('runtime').stop_reason, 'previous-runtime');
  assert.equal(state('runtime-late').stop_reason, 'previous-runtime');
  assert.deepEqual(JSON.parse(state('runtime-late').quality_reasons), ['live-start-not-captured']);
  assert.equal(state('complete-tolerance').quality, 'complete');
  assert.deepEqual(JSON.parse(state('complete-tolerance').quality_reasons), []);
  assert.equal(state('complete-over-tolerance').quality, 'incomplete');
  assert.deepEqual(JSON.parse(state('complete-over-tolerance').quality_reasons), ['live-start-not-captured']);
  assert.equal(state('complete').quality, 'complete');
  assert.equal(state('complete').status, 'ended');
  for (const id of ['late', 'old-complete-late', 'switched']) {
    assert.equal(state(id).quality, 'incomplete');
    assert.ok(JSON.parse(state(id).quality_reasons).length > 0);
  }
  assert.deepEqual(JSON.parse(state('switched').quality_reasons), ['live-start-not-captured', 'connection-switched']);
  assert.ok(states.every(row => row.recording_status === 'stopped'));
  const migrated = db.prepare('SELECT * FROM archive_session ORDER BY session_id').all();
  await initializeArchiveDatabase(adapter);
  assert.deepEqual(db.prepare('SELECT * FROM archive_session ORDER BY session_id').all(), migrated);
  assert.deepEqual(content(), before);
});

test('真实 SQLite 读写、查询、删除保护和导入支持新状态', async (t) => {
  const { db, adapter } = await temporarySqlite(t);
  const { ArchiveRepository, reconcileStaleArchiveSessions } = await import('../src/archive/archiveRepository.ts');
  const repository = new ArchiveRepository(adapter);
  const base = { ownerId: 'owner', roomId: 1, startedAt: 100, status: 'unclean', quality: 'incomplete',
    qualityReason: 'live-start-not-captured', stopReason: null, qualityReasons: ['live-start-not-captured'], updatedAt: 200 };
  for (const [sessionId, recordingStatus] of [['record', 'recording'], ['retry', 'reconnecting'], ['stop', 'stopped']]) {
    await repository.upsertSession({ ...base, sessionId, recordingStatus });
    const stored = await repository.getSession(sessionId);
    assert.equal(stored.recordingStatus, recordingStatus);
    assert.deepEqual(stored.qualityReasons, ['live-start-not-captured']);
  }
  assert.deepEqual((await repository.listSessions({ recordingStatus: 'reconnecting' })).map(s => s.sessionId), ['retry']);
  const preview = await repository.getDeletePreview({ all: true });
  assert.deepEqual(preview.sessionIds, ['stop']);
  assert.deepEqual(preview.blockedSessionIds, ['record', 'retry']);
  assert.equal(preview.blockedSessionStates[1].recordingStatus, 'reconnecting');
  await repository.deleteArchive({ all: true });
  assert.equal(await repository.getSession('stop'), null);
  assert.ok(await repository.getSession('retry'));
  await repository.updateSession({ sessionId: 'retry', recordingStatus: 'stopped', stopReason: 'manual-disconnect',
    qualityReasons: ['live-start-not-captured', 'connection-error'] });
  const snapshot = await repository.getTransferSnapshot({ kind: 'session', sessionId: 'retry' });
  assert.equal(snapshot.sessions[0].session.stopReason, 'manual-disconnect');
  assert.deepEqual(snapshot.sessions[0].session.qualityReasons, ['live-start-not-captured', 'connection-error']);
  assert.equal(await reconcileStaleArchiveSessions(repository, 999), 1);
  assert.equal((await repository.getSession('record')).recordingStatus, 'stopped');
  assert.equal((await repository.getSession('record')).endedAt, null);
  assert.equal(db.prepare("SELECT event_count FROM archive_session WHERE session_id = 'record'").get().event_count, 0);
  const importedState = { ...base, status: 'active', recordingStatus: 'reconnecting',
    stopReason: 'manual-disconnect', qualityReasons: ['live-start-not-captured', 'connection-error'], createdAt: 100 };
  for (const withOwner of [true, false]) {
    const plan = { sourceId: `source-${withOwner}`, counts: { ownerCount: 1, sessionCount: 1, imported: 0, newEvents: 0,
      skipped: 0, completedFields: 0, conflicts: 0, unmatched: 0 },
      owners: withOwner ? [{ ownerId: 'owner', roomId: 1, createdAt: 100, updatedAt: 200 }] : [],
      sessionCreates: [{ ...importedState, sessionId: `import-${withOwner}` }], sessionPatches: [],
      newEvents: [], favorites: [], nicknames: [], readingStates: [], historicalFavorites: [], affectedSessionIds: [] };
    await repository.commitArchiveImport(plan);
    const imported = await repository.getSession(`import-${withOwner}`);
    assert.equal(imported.status, 'unclean');
    assert.equal(imported.recordingStatus, 'stopped');
    assert.equal(imported.stopReason, 'manual-disconnect');
    assert.deepEqual(imported.qualityReasons, ['live-start-not-captured', 'connection-error']);
    await repository.commitArchiveImport({ ...plan, sessionCreates: [],
      sessionPatches: [{ sessionId: 'record', qualityReasons: ['connection-switched'] }] });
    const merged = await repository.getSession('record');
    assert.deepEqual(new Set(merged.qualityReasons), new Set(['live-start-not-captured', 'connection-switched']));
    assert.equal(merged.stopReason, 'previous-runtime');
  }
  await repository.upsertSession({ ...base, sessionId: 'read-paths', recordingStatus: 'reconnecting', stopReason: null });
  await repository.appendEvents([{ eventKey: 'new-event', sessionId: 'read-paths', roomId: 1, ordinal: 0,
    eventTs: 101, primaryCategory: 'danmu', searchText: '正文', payload: { id: 'new-event', msgType: 0, text: '正文', ts: 101, roomId: 1 } }]);
  await repository.setFavorite('new-event', true, 150);
  const groups = await repository.queryOwnerEventGroups({ ownerId: 'owner' });
  const record = (await repository.queryEvents({ sessionId: 'read-paths' })).items[0];
  const favorite = (await repository.queryFavorites()).items[0];
  const resumable = await repository.findResumableSession(1, 1);
  assert.equal(resumable, null);
  assert.equal(record.sessionRecordingStatus, 'reconnecting');
  assert.deepEqual(record.sessionQualityReasons, ['live-start-not-captured']);
  assert.equal(favorite.eventKey, 'new-event');
  assert.equal((await repository.getEvent('new-event')).sessionRecordingStatus, 'reconnecting');
  assert.equal(groups.items[0].session.recordingStatus, 'reconnecting');
  assert.equal(groups.items[0].matches[0].sessionRecordingStatus, 'reconnecting');
});

test('按驱动参数顺序删除指定主播的云端恢复场次', async (t) => {
  const { db, adapter } = await temporarySqlite(t);
  const { ArchiveRepository } = await import('../src/archive/archiveRepository.ts');
  const sessionId = '["cloud-session","server","1","remote-session"]';
  const base = { sessionId, ownerId: 'owner', roomId: 1, startedAt: 100, status: 'active',
    quality: 'in-progress', recordingStatus: 'stopped', createdAt: 100, updatedAt: 200 };
  const setupRepository = new ArchiveRepository(adapter);
  await setupRepository.upsertSession(base);

  const bindInOccurrenceOrder = (sql, values) => {
    const placeholders = [...new Set(sql.match(/\$\d+/g) ?? [])];
    return Object.fromEntries(placeholders.map((placeholder, index) => [placeholder, values[index]]));
  };
  const positionalAdapter = {
    async select(sql, values = []) { return db.prepare(sql).all(bindInOccurrenceOrder(sql, values)); },
    async execute(sql, values = []) {
      const bindings = bindInOccurrenceOrder(sql, values);
      const result = db.prepare(sql).run(bindings);
      return { rowsAffected: Number(result.changes) };
    },
    async executeTransaction(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await this.execute(statement.sql, statement.values));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const repository = new ArchiveRepository(positionalAdapter);
  const preview = await repository.getDeletePreview({ ownerId: 'owner', sessionIds: [sessionId] });
  assert.deepEqual(preview.sessionIds, [sessionId]);

  await repository.deleteArchive({ ownerId: 'owner', sessionIds: [sessionId] }, preview.sessionIds);

  assert.equal(await repository.getSession(sessionId), null);
});

test('取消云端恢复只删除本次新增事件和变空的新建场次', async (t) => {
  const { adapter } = await temporarySqlite(t);
  const { ArchiveRepository } = await import('../src/archive/archiveRepository.ts');
  const repository = new ArchiveRepository(adapter);
  const base = { ownerId: 'owner', roomId: 1, startedAt: 100, status: 'ended', quality: 'complete',
    recordingStatus: 'stopped', createdAt: 100, updatedAt: 200 };
  await repository.upsertSession({ ...base, sessionId: 'existing-session' });
  await repository.upsertSession({ ...base, sessionId: 'created-session' });
  const payload = id => ({ id, msgType: 0, text: id, ts: 101, roomId: 1 });
  await repository.appendEvents([
    { eventKey: 'kept-event', sessionId: 'existing-session', roomId: 1, ordinal: 0, eventTs: 101,
      primaryCategory: 'danmu', searchText: '保留', payload: payload('kept-event'), sourceId: 'cloud-recovery-run:old' },
    { eventKey: 'removed-event', sessionId: 'created-session', roomId: 1, ordinal: 0, eventTs: 101,
      primaryCategory: 'danmu', searchText: '删除', payload: payload('removed-event'), sourceId: 'cloud-recovery-run:run-1' },
  ]);

  await repository.rollbackCloudRecoveryRun('cloud-recovery-run:run-1', ['created-session']);

  assert.ok(await repository.getEvent('kept-event'));
  assert.equal(await repository.getEvent('removed-event'), null);
  assert.equal(await repository.getSession('created-session'), null);
  assert.ok(await repository.getSession('existing-session'));
  assert.equal((await repository.getSession('existing-session')).eventCount, 1);
});

test('启动收口处理超过默认首批数量的遗留记录', async (t) => {
  const { db, adapter } = await temporarySqlite(t);
  const { ArchiveRepository, reconcileStaleArchiveSessions } = await import('../src/archive/archiveRepository.ts');
  const insert = db.prepare(`INSERT INTO archive_session
    (session_id, owner_id, room_id, started_at, status, quality, recording_status, created_at, updated_at)
    VALUES (?, 'owner', 1, 100, 'active', 'in-progress', 'recording', 100, 200)`);
  for (let i = 0; i < 101; i++) insert.run(`stale-${i}`);
  assert.equal(await reconcileStaleArchiveSessions(new ArchiveRepository(adapter), 999), 101);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM archive_session WHERE recording_status <> 'stopped'").get().n, 0);
});

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`无法加载待实现的档案模块 ${relativePath}: ${message}`);
  }
}

class FakeDatabase {
  constructor({ selectResults = [], rowsAffected = 1 } = {}) {
    this.executeCalls = [];
    this.selectCalls = [];
    this.selectResults = [...selectResults];
    this.rowsAffected = rowsAffected;
    this.failWhen = null;
    this.transactionCalls = [];
  }

  async execute(query, bindValues = []) {
    this.executeCalls.push({ query, bindValues });
    if (this.failWhen?.test(query)) {
      throw new Error("fake database failure");
    }
    return { rowsAffected: this.rowsAffected };
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    if (/LEFT JOIN archive_event e ON e\.session_id = s\.session_id/i.test(query) && /payload_json/i.test(query)) {
      return [];
    }
    return this.selectResults.shift() ?? [];
  }

  async executeTransaction(statements) {
    this.transactionCalls.push(statements);
    await this.execute("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await this.execute(statement.sql, statement.values ?? []));
      }
      await this.execute("COMMIT");
      return results;
    } catch (error) {
      await this.execute("ROLLBACK");
      throw error;
    }
  }
}

class TransactionAwareDatabase extends FakeDatabase {
  constructor(options = {}) {
    super(options);
    this.transactionCalls = [];
  }

  async executeTransaction(statements) {
    this.transactionCalls.push(statements);
    const results = [];
    for (const statement of statements) {
      results.push(await this.execute(statement.sql, statement.values ?? []));
    }
    return results;
  }
}

class OrderedReadingStateDatabase {
  constructor() {
    this.executeCalls = [];
    this.readingWrites = [];
  }

  execute(query, bindValues = []) {
    this.executeCalls.push({ query, bindValues });
    if (!/INSERT INTO archive_reading_state/i.test(query)) {
      return Promise.resolve({ rowsAffected: 1 });
    }
    return new Promise((resolve, reject) => {
      this.readingWrites.push({ bindValues, resolve, reject });
    });
  }

  async executeTransaction(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await this.execute(statement.sql, statement.values ?? []));
    }
    return results;
  }

  async select() {
    return [];
  }

  resolveWrite(index) {
    this.readingWrites[index]?.resolve({ rowsAffected: 1 });
  }
}

class ConcurrentTransactionDatabase {
  constructor() {
    this.executeCalls = [];
    this.inTransaction = false;
    this.resolveEventInsert = null;
    this.transactionStarted = new Promise((resolve) => {
      this.resolveTransactionStarted = resolve;
    });
    this.eventInsertReleased = new Promise((resolve) => {
      this.resolveEventInsert = resolve;
    });
    this.transactionTail = Promise.resolve();
  }

  async execute(query, bindValues = []) {
    this.executeCalls.push({ query, bindValues });
    if (query === "BEGIN") {
      if (this.inTransaction) throw new Error("cannot start a transaction within a transaction");
      this.inTransaction = true;
      this.resolveTransactionStarted();
    }
    if (/INSERT INTO archive_event/i.test(query)) await this.eventInsertReleased;
    if (query === "COMMIT" || query === "ROLLBACK") this.inTransaction = false;
    return { rowsAffected: 1 };
  }

  async executeTransaction(statements) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    return previous.then(async () => {
      await this.execute("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await this.execute(statement.sql, statement.values ?? []));
        }
        await this.execute("COMMIT");
        return results;
      } catch (error) {
        await this.execute("ROLLBACK");
        throw error;
      } finally {
        release();
      }
    });
  }

  async select(query) {
    if (/payload_json/i.test(query) && /archive_event/i.test(query)) return [];
    return [];
  }
}

class DeleteRaceDatabase {
  constructor() {
    this.selectCalls = [];
    this.transactionCalls = [];
    this.sessionStatus = "ended";
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    if (/SELECT s\.session_id AS sessionId/i.test(query)) {
      return [{ sessionId: "session-1", status: "ended" }];
    }
    return [];
  }

  async executeTransaction(statements) {
    this.transactionCalls.push(statements);
    this.sessionStatus = "active";
    return statements.map((statement) => {
      if (!/DELETE FROM archive_session/i.test(statement.sql)) return { rowsAffected: 1 };
      const rowsAffected = this.sessionStatus === "ended" ? 1 : 0;
      return { rowsAffected };
    });
  }
}

class ConcurrentOwnerImportDatabase {
  constructor() {
    this.selectCalls = [];
    this.transactionCalls = [];
    this.ownerByRoom = new Map();
    this.ownerById = new Map();
    this.transactionTail = Promise.resolve();
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    return [];
  }

  async executeTransaction(statements) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    return previous.then(async () => {
      this.transactionCalls.push(statements);
      const ownerByRoom = new Map(this.ownerByRoom);
      const ownerById = new Map(
        [...this.ownerById].map(([ownerId, owner]) => [ownerId, { ...owner }]),
      );
      try {
        const results = [];
        for (const statement of statements) {
          results.push(this.executeStatement(statement, ownerByRoom, ownerById));
        }
        this.ownerByRoom = ownerByRoom;
        this.ownerById = ownerById;
        return results;
      } finally {
        release();
      }
    });
  }

  executeStatement(statement, ownerByRoom, ownerById) {
    if (/UPDATE archive_owner/i.test(statement.sql)) {
      const [ownerId, roomId, uid, name, avatarUrl, updatedAt] = statement.values;
      const existingId = ownerById.has(ownerId)
        ? ownerId
        : ownerByRoom.get(roomId)
          ?? [...ownerById.values()].find((owner) => owner.uid === uid)?.ownerId;
      if (existingId !== undefined) {
        const owner = ownerById.get(existingId);
        owner.uid ??= uid;
        owner.name ??= name;
        owner.avatarUrl ??= avatarUrl;
        owner.updatedAt = Math.max(Number(owner.updatedAt), Number(updatedAt));
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    if (/INSERT INTO archive_owner/i.test(statement.sql)) {
      const [ownerId, roomId, uid, name, avatarUrl, createdAt, updatedAt] = statement.values;
      const existingId = ownerById.has(ownerId)
        ? ownerId
        : ownerByRoom.get(roomId)
          ?? [...ownerById.values()].find((owner) => owner.uid === uid)?.ownerId;
      if (/WHERE NOT EXISTS/i.test(statement.sql) && existingId !== undefined) {
        return { rowsAffected: 0 };
      }
      if (existingId !== undefined && existingId !== ownerId) {
        throw new Error("UNIQUE constraint failed: archive_owner.room_id");
      }
      if (existingId === ownerId) return { rowsAffected: 0 };
      const owner = { ownerId, roomId, uid, name, avatarUrl, createdAt, updatedAt };
      ownerByRoom.set(roomId, ownerId);
      ownerById.set(ownerId, owner);
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }
}

class PaidTotalDatabase {
  constructor({ sessions, events }) {
    this.sessions = new Map(sessions.map((session) => [session.sessionId, { ...session }]));
    this.events = [...events];
    this.executeCalls = [];
    this.selectCalls = [];
  }

  async execute(query, bindValues = []) {
    this.executeCalls.push({ query, bindValues });
    if (/UPDATE archive_session\s+SET\s+paid_total/i.test(query)) {
      const [paidTotal, updatedAt, sessionId, expectedPaidTotal] = bindValues;
      const session = this.sessions.get(sessionId);
      assert.ok(session, `unknown session ${sessionId}`);
      if (/AND\s+paid_total\s*=\s*\$4/i.test(query)
        && Number(session.paidTotal) !== Number(expectedPaidTotal)) {
        return { rowsAffected: 0 };
      }
      session.paidTotal = Number(paidTotal);
      session.updatedAt = Number(updatedAt);
    }
    return { rowsAffected: 1 };
  }

  async executeTransaction(statements) {
    await this.execute("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await this.execute(statement.sql, statement.values ?? []));
      }
      await this.execute("COMMIT");
      return results;
    } catch (error) {
      await this.execute("ROLLBACK");
      throw error;
    }
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    if (/payload_json/i.test(query) && /archive_event/i.test(query)) {
      return [...this.sessions.values()].flatMap((session) => {
        const sessionEvents = this.events
          .filter((event) => event.sessionId === session.sessionId)
          .sort((left, right) => left.ordinal - right.ordinal);
        return sessionEvents.length > 0
          ? sessionEvents.map((event) => ({ ...event, paidTotal: session.paidTotal }))
          : [{ sessionId: session.sessionId, eventKey: null, ordinal: null, payloadJson: null, paidTotal: session.paidTotal }];
      });
    }
    if (/WITH\s+session_metrics\s+AS/i.test(query)) {
      const paidTotal = [...this.sessions.values()].reduce((sum, session) => sum + session.paidTotal, 0);
      return [{
        ownerId: "room:101",
        roomId: 101,
        uid: null,
        name: "主播甲",
        avatarUrl: null,
        createdAt: 1,
        updatedAt: 2,
        sessionCount: this.sessions.size,
        eventCount: this.events.length,
        paidTotal,
        favoriteCount: 0,
        incompleteSessionCount: 0,
        latestSessionAt: 3,
      }];
    }
    throw new Error(`unexpected select query: ${query}`);
  }
}

class InterleavedPaidTotalDatabase extends PaidTotalDatabase {
  constructor(options) {
    super(options);
    this.snapshotRead = new Promise((resolve) => {
      this.resolveSnapshotRead = resolve;
    });
    this.snapshotRelease = new Promise((resolve) => {
      this.resolveSnapshotRelease = resolve;
    });
  }

  async select(query, bindValues = []) {
    if (/payload_json/i.test(query) && /archive_event/i.test(query)) {
      const snapshot = await super.select(query, bindValues);
      this.resolveSnapshotRead();
      await this.snapshotRelease;
      return snapshot;
    }
    return super.select(query, bindValues);
  }

  releaseSnapshot() {
    this.resolveSnapshotRelease();
  }
}

const archivedPaymentEvent = (sessionId, ordinal, id, payload) => ({
  sessionId,
  eventKey: `${sessionId}:archive-event:${id}`,
  ordinal,
  payloadJson: JSON.stringify({ id, roomId: 101, ts: 1_700_000_000_000 + ordinal, ...payload }),
});

function createHistoricalPaymentDatabase() {
  const sessionId = "session-history";
  return new PaidTotalDatabase({
    sessions: [{ sessionId, ownerId: "room:101", paidTotal: 0, updatedAt: 1 }],
    events: [
      archivedPaymentEvent(sessionId, 0, "gift-1", {
        msgType: 1,
        gift: {
          id: 1,
          name: "小花",
          count: 1,
          price: 1250,
          total: 1250,
          coinType: "gold",
          priceRmb: 1.25,
          totalRmb: 1.25,
          isFree: false,
        },
      }),
      archivedPaymentEvent(sessionId, 1, "blind-1", {
        msgType: 1,
        gift: {
          id: 2,
          name: "电影票",
          count: 2,
          price: 0,
          total: 0,
          coinType: "gold",
          priceRmb: 0,
          totalRmb: 0,
          isFree: false,
          blindGiftName: "心动盲盒",
          blindPriceRmb: 2.5,
          blindHitPriceRmb: 3,
        },
      }),
      archivedPaymentEvent(sessionId, 2, "sc-1", {
        msgType: 2,
        sc: { price: 0.75, message: "支持" },
      }),
      archivedPaymentEvent(sessionId, 3, "guard-1", {
        msgType: 3,
        guard: { level: 1, count: 1, priceRmb: 3.2 },
      }),
      archivedPaymentEvent(sessionId, 4, "combo-send", {
        msgType: 1,
        comboId: "combo-history",
        gift: { count: 1, totalRmb: 0.5, priceRmb: 0.5, isFree: false },
      }),
      archivedPaymentEvent(sessionId, 5, "combo-update-2", {
        msgType: 1,
        comboId: "combo-history",
        isComboUpdate: true,
        gift: { count: 2, totalRmb: 1.25, priceRmb: 0, isFree: false },
      }),
      archivedPaymentEvent(sessionId, 6, "combo-update-3", {
        msgType: 1,
        comboId: "combo-history",
        isComboUpdate: true,
        gift: { count: 3, totalRmb: 1.75, priceRmb: 0, isFree: false },
      }),
    ],
  });
}

const eventInput = {
  eventKey: "event-1",
  sessionId: "session-1",
  roomId: 101,
  ordinal: 0,
  eventTs: 1_700_000_000_000,
  primaryCategory: "danmu",
  secondaryCategory: "text",
  userUid: "user-1",
  userName: "原始昵称",
  searchText: "你好",
  payload: {
    id: "event-1",
    msgType: 0,
    roomId: 101,
    ts: 1_700_000_000_000,
    text: "你好",
  },
};

function createConcurrentImportPlan(sourceId, ownerId) {
  return {
    sourceId,
    counts: {
      ownerCount: 1,
      sessionCount: 1,
      imported: 0,
      newEvents: 0,
      skipped: 0,
      completedFields: 0,
      conflicts: 0,
      unmatched: 0,
    },
    owners: [{
      ownerId,
      roomId: 101,
      uid: "uid-101",
      name: "主播",
      avatarUrl: null,
      createdAt: 1,
      updatedAt: 1,
    }],
    sessionCreates: [{
      sessionId: `${sourceId}-session`,
      ownerId,
      roomId: 101,
      title: "场次",
      startedAt: 1,
      endedAt: 2,
      status: "ended",
      quality: "complete",
      qualityReason: null,
      eventCount: 0,
      paidTotal: 0,
      favoriteCount: 0,
      createdAt: 1,
      updatedAt: 2,
    }],
    sessionPatches: [],
    newEvents: [],
    favorites: [],
    nicknames: [],
    readingStates: [],
    historicalFavorites: [],
    affectedSessionIds: [],
  };
}

test("启动恢复收口运行状态，保留结束证据与已知缺口", async () => {
  const { reconcileStaleArchiveSessions } = await loadModule("../src/archive/archiveRepository.ts");
  const updates = [];
  const repository = {
    listSessions: async (query) => {
      assert.deepEqual(query, { recordingStatus: ['recording', 'reconnecting'] });
      return [
        { sessionId: "stale-1", status: "active", recordingStatus: 'recording', quality: "in-progress", qualityReasons: [] },
        { sessionId: "stale-2", status: "ended", recordingStatus: 'reconnecting', quality: "incomplete", qualityReasons: ['live-start-not-captured'] },
      ];
    },
    updateSession: async (input) => updates.push(input),
  };

  const count = await reconcileStaleArchiveSessions(repository, 1234);
  assert.equal(count, 2);
  assert.deepEqual(updates, [
    { sessionId: "stale-1", status: "unclean", recordingStatus: 'stopped', stopReason: 'previous-runtime', updatedAt: 1234 },
    { sessionId: "stale-2", status: "ended", recordingStatus: 'stopped', stopReason: 'previous-runtime', updatedAt: 1234 },
  ]);
});

test("档案 schema 声明版本、表、外键、唯一键和查询索引", async () => {
  const { ARCHIVE_SCHEMA_SQL, ARCHIVE_SCHEMA_VERSION } = await loadModule(
    "../src/archive/archiveSchema.ts",
  );

  assert.equal(ARCHIVE_SCHEMA_VERSION, 9);
  for (const table of [
    "archive_owner",
    "archive_session",
    "archive_event",
    "archive_user_profile",
    "archive_source",
    "archive_event_source",
    "archive_favorite",
    "archive_historical_favorite",
    "archive_favorite_tag",
    "archive_favorite_event_tag",
    "archive_historical_favorite_tag",
    "archive_reading_state",
    "archive_search_index",
  ]) {
    assert.match(ARCHIVE_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(
    ARCHIVE_SCHEMA_SQL,
    /FOREIGN KEY\s*\(session_id\)\s*REFERENCES\s+archive_session\s*\(session_id\)/i,
  );
  assert.match(ARCHIVE_SCHEMA_SQL, /UNIQUE\s*\(session_id,\s*ordinal\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /event_key\s+TEXT\s+PRIMARY KEY/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /archive_favorite[\s\S]*event_key\s+TEXT\s+PRIMARY KEY/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /ON archive_session\s*\(room_id,\s*started_at\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /live_key\s+TEXT/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /sub_session_key\s+TEXT/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /source_live_started_at\s+INTEGER/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /cover_url\s+TEXT/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /ON archive_event\s*\(session_id,\s*event_ts,\s*ordinal\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /ON archive_event\s*\(session_id,\s*primary_category,\s*event_ts\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /ON archive_event\s*\(user_uid,\s*event_ts\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /ON archive_favorite\s*\(session_id,\s*favorited_at\)/i);
  assert.match(ARCHIVE_SCHEMA_SQL, /PRAGMA user_version = 9/i);
});

test("初始化档案数据库时启用外键并执行全部 schema 语句", async () => {
  const { ARCHIVE_SCHEMA_SQL, ARCHIVE_SCHEMA_STATEMENTS, initializeArchiveDatabase } = await loadModule(
    "../src/archive/archiveSchema.ts",
  );
  const db = new FakeDatabase();

  await initializeArchiveDatabase(db);

  assert.match(db.executeCalls[0].query, /^PRAGMA foreign_keys = ON$/i);
  assert.ok(db.executeCalls.some(({ query }) => query.includes("archive_owner")));
  assert.ok(db.executeCalls.some(({ query }) => query.includes("archive_search_index")));
  assert.ok(db.executeCalls.some(({ query }) => /UPDATE archive_event\s+SET primary_category = 'system'\s+WHERE primary_category = 'lifecycle'/i.test(query)));
  assert.ok(db.executeCalls.some(({ query }) => /UPDATE archive_session\s+SET/i.test(query)
    && /source_live_started_at\s*<\s*started_at/i.test(query)
    && /live-start-not-captured/i.test(query)));
  assert.ok(db.executeCalls.some(({ query }) => /DELETE FROM archive_owner/i.test(query) && /NOT EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+archive_session/i.test(query)));
  assert.ok(db.executeCalls.some(({ query }) => /ALTER TABLE archive_session ADD COLUMN cover_url TEXT/i.test(query)));
  assert.ok(db.selectCalls.some(({ query }) => /FROM archive_event e[\s\S]*LIMIT/i.test(query)));
  assert.ok(db.executeCalls.some(({ query }) => /ALTER TABLE archive_historical_favorite ADD COLUMN search_text/i.test(query)));
  assert.ok(db.executeCalls.length >= ARCHIVE_SCHEMA_STATEMENTS.length);
  assert.ok(ARCHIVE_SCHEMA_SQL.includes("PRAGMA user_version = 9"));
  assert.ok(db.executeCalls.some(({ query }) => /PRAGMA user_version = 9/i.test(query)));
});

test("场次查询和写入透传 coverUrl", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-cover",
      ownerId: "room:101",
      roomId: 101,
      title: "有封面的直播",
      coverUrl: "https://example.com/session-cover.jpg",
      latestTitle: "有封面的直播",
      titleSource: "bilibili",
      liveKey: null,
      subSessionKey: null,
      sourceLiveStartedAt: 1_700_000_000_000,
      identityEvidence: "source-live-time",
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_360_000,
      status: "ended",
      quality: "complete",
      qualityReason: null,
      eventCount: 10,
      paidTotal: 20,
      favoriteCount: 0,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_360_000,
    }]],
  });
  const repository = new ArchiveRepository(db);
  const [session] = await repository.listSessions({ ownerId: "room:101" });

  assert.equal(session.coverUrl, "https://example.com/session-cover.jpg");

  await repository.upsertSession({
    sessionId: "session-cover",
    ownerId: "room:101",
    roomId: 101,
    title: "有封面的直播",
    coverUrl: "https://example.com/session-cover.jpg",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_360_000,
    status: "ended",
    quality: "complete",
    updatedAt: 1_700_000_360_000,
  });
  const upsert = db.executeCalls.find(({ query }) => /INSERT INTO archive_session/i.test(query));
  assert.match(upsert.query, /cover_url/i);
  assert.ok(upsert.bindValues.includes("https://example.com/session-cover.jpg"));
});

test("updateSession 可以补写场次封面", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.updateSession({
    sessionId: "session-cover",
    coverUrl: "https://example.com/session-cover.jpg",
    updatedAt: 1234,
  });

  const update = db.executeCalls.find(({ query }) => /UPDATE archive_session/i.test(query));
  assert.match(update.query, /cover_url\s*=/i);
  assert.equal(update.bindValues[0], "https://example.com/session-cover.jpg");
});

test("schema 初始化失败后下一次打开会重新尝试并成功", async () => {
  const { createArchiveDatabaseOpener } = await loadModule(
    "../src/archive/archiveRepository.ts",
  );
  const firstDatabase = new FakeDatabase();
  firstDatabase.failWhen = /^PRAGMA foreign_keys/;
  const secondDatabase = new FakeDatabase();
  let loadCount = 0;
  const openDatabase = createArchiveDatabaseOpener(async () => {
    loadCount += 1;
    return loadCount === 1 ? firstDatabase : secondDatabase;
  });

  await assert.rejects(() => openDatabase(), /fake database failure/);
  assert.equal(await openDatabase(), secondDatabase);
  assert.equal(loadCount, 2);
  assert.ok(secondDatabase.executeCalls.length > 0);
});

test("主播汇总使用不受场次列表 limit 影响的完整聚合，并保留小数付费总额", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      ownerId: "room:101",
      roomId: 101,
      uid: null,
      name: "主播甲",
      avatarUrl: null,
      createdAt: 1,
      updatedAt: 2,
      sessionCount: 501,
      eventCount: 12_345,
      paidTotal: "12.345",
      favoriteCount: 99,
      incompleteSessionCount: 7,
      latestSessionAt: 3,
    }]],
  });
  const repository = new ArchiveRepository(db);

  const [owner] = await repository.listOwners({ limit: 500 });

  assert.equal(owner.sessionCount, 501);
  assert.equal(owner.eventCount, 12_345);
  assert.equal(owner.paidTotal, 12.345);
  assert.equal(owner.incompleteSessionCount, 7);
  const ownerQuery = db.selectCalls.find(({ query }) => /WITH\s+session_metrics\s+AS/i.test(query));
  assert.ok(ownerQuery);
  assert.match(ownerQuery.query, /SUM\(s\.paid_total\)/i);
  assert.match(ownerQuery.query, /COUNT\(DISTINCT e\.event_key\)/i);
  assert.match(ownerQuery.query, /LIMIT \$\d+/i);
});

test("主播汇总只返回仍有场次的主播", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({ selectResults: [[]] });
  const repository = new ArchiveRepository(db);

  await repository.listOwners({ limit: 500 });

  const ownerQuery = db.selectCalls.find(({ query }) => /WITH\s+session_metrics\s+AS/i.test(query));
  assert.ok(ownerQuery);
  assert.match(ownerQuery.query, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+archive_session/i);
});

test("无主播资料的生命周期更新不会清空已保存的主播资料", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.upsertOwner({
    ownerId: "room:101",
    roomId: 101,
    uid: null,
    name: null,
    avatarUrl: null,
    updatedAt: 2,
  });

  const statement = db.transactionCalls[0]?.[0];
  assert.ok(statement);
  assert.match(statement.sql, /owner_name\s*=\s*COALESCE\(NULLIF\(trim\(excluded\.owner_name\),\s*''\),\s*archive_owner\.owner_name\)/i);
  assert.match(statement.sql, /owner_uid\s*=\s*COALESCE\(NULLIF\(trim\(excluded\.owner_uid\),\s*''\),\s*archive_owner\.owner_uid\)/i);
  assert.match(statement.sql, /owner_avatar_url\s*=\s*COALESCE\(NULLIF\(trim\(excluded\.owner_avatar_url\),\s*''\),\s*archive_owner\.owner_avatar_url\)/i);
});

test("删除单场档案后清理没有剩余场次的主播主记录", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.deleteSession("session-1");

  const [statements] = db.transactionCalls;
  assert.ok(statements);
  assert.match(statements[0].sql, /DELETE FROM archive_session/i);
  assert.match(statements[1].sql, /DELETE FROM archive_owner/i);
  assert.match(statements[1].sql, /NOT EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+archive_session/i);
});

test("批量删除档案后清理没有剩余场次的主播主记录", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.deleteArchive({ all: true });

  const [statements] = db.transactionCalls;
  assert.ok(statements);
  assert.match(statements[0].sql, /DELETE FROM archive_session/i);
  assert.match(statements[1].sql, /DELETE FROM archive_owner/i);
});

test("listOwners 不等待历史 payload 回算，历史收益回算单独执行", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = createHistoricalPaymentDatabase();
  const repository = new ArchiveRepository(db);

  const [owner] = await repository.listOwners({ limit: 500 });

  assert.equal(owner.paidTotal, 0);
  assert.equal(db.sessions.get("session-history").paidTotal, 0);
  const recomputeIndex = db.selectCalls.findIndex(({ query }) => /payload_json/i.test(query));
  const ownerIndex = db.selectCalls.findIndex(({ query }) => /WITH\s+session_metrics\s+AS/i.test(query));
  assert.equal(recomputeIndex, -1);
  assert.ok(ownerIndex >= 0);

  assert.equal(await repository.recomputePaidTotals(), 1);
  assert.equal(db.sessions.get("session-history").paidTotal, 11.95);
  const paidUpdates = db.executeCalls.filter(({ query }) => /UPDATE archive_session\s+SET\s+paid_total/i.test(query));
  assert.equal(paidUpdates.length, 1);
  assert.equal(paidUpdates[0].bindValues[0], 11.95);

  assert.equal(await repository.recomputePaidTotals(), 0);
  const repeatedPaidUpdates = db.executeCalls.filter(({ query }) => /UPDATE archive_session\s+SET\s+paid_total/i.test(query));
  assert.equal(repeatedPaidUpdates.length, 1);
  assert.equal(db.sessions.get("session-history").paidTotal, 11.95);
});

test("收益核对只读取可计费类型，保留连击规则与空场次", async (t) => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const { db, adapter } = await temporarySqlite(t);
  for (const sessionId of ["paid", "empty", "chat-only"]) {
    db.prepare(`INSERT INTO archive_session
      (session_id, owner_id, room_id, started_at, status, quality, paid_total, created_at, updated_at)
      VALUES (?, 'owner', 1, 100, 'ended', 'complete', 99, 100, 200)`).run(sessionId);
  }
  const insert = db.prepare(`INSERT INTO archive_event
    (event_key, session_id, room_id, ordinal, event_ts, primary_category, payload_json)
    VALUES (?, ?, 1, ?, 100, 'danmu', ?)`);
  let ordinal = 0;
  const append = (payload, sessionId = "paid") => {
    const id = `event-${ordinal++}`;
    insert.run(id, sessionId, ordinal, JSON.stringify({ id, roomId: 1, ts: 100, ...payload }));
  };
  for (let i = 0; i < 1000; i++) {
    append({ msgType: 0, text: "普通弹幕".repeat(32) });
    append({ msgType: 10, text: "进入直播间" });
  }
  append({ msgType: 1, gift: { totalRmb: 1.25, count: 1 } });
  append({ msgType: 1, gift: { blindGiftName: "盲盒", blindPriceRmb: 2.5, count: 2 } });
  append({ msgType: 2, sc: { price: 0.75 } });
  append({ msgType: 3, guard: { priceRmb: 3.2 } });
  append({ msgType: 9, guard: { priceRmb: 7 } });
  append({ msgType: 1, comboId: "combo", gift: { totalRmb: 0.5 } });
  append({ msgType: 1, comboId: "combo", isComboUpdate: true, gift: { totalRmb: 1.75 } });
  append({ msgType: 1, comboId: "combo", gift: { totalRmb: 0.5 } });
  append({ msgType: 1, gift: { isFree: true, totalRmb: 100 } });
  insert.run("invalid", "paid", ++ordinal, "{invalid");
  append({ msgType: 0, text: "仅有弹幕" }, "chat-only");
  adapter.reset();
  const repository = new ArchiveRepository(adapter);
  assert.equal(await repository.recomputePaidTotals(), 3);
  assert.equal(db.prepare("SELECT paid_total FROM archive_session WHERE session_id = 'paid'").get().paid_total, 18.95);
  assert.equal(db.prepare("SELECT paid_total FROM archive_session WHERE session_id = 'empty'").get().paid_total, 0);
  assert.equal(db.prepare("SELECT paid_total FROM archive_session WHERE session_id = 'chat-only'").get().paid_total, 0);
  const read = adapter.reads.find(({ sql }) => /payload_json AS payloadJson/.test(sql));
  assert.equal(read.rows, 11, "只返回9条可计费类型事件与2个无计费事件的场次");
  assert.equal(await repository.recomputePaidTotals(), 0);
});

test("场次事件数校正后，主播汇总使用场次计数而不是再次扫描事件表", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      ownerId: "room:101",
      roomId: 101,
      uid: null,
      name: "主播甲",
      avatarUrl: null,
      createdAt: 1,
      updatedAt: 2,
      sessionCount: 1,
      eventCount: 3,
      paidTotal: 0,
      favoriteCount: 0,
      incompleteSessionCount: 0,
      latestSessionAt: 3,
    }]],
  });
  const repository = new ArchiveRepository(db);

  assert.equal(await repository.recomputeEventCounts(), 1);
  await repository.listOwners({ limit: 500 });

  const eventCountUpdate = db.executeCalls.find(({ query }) => /UPDATE archive_session\s+SET\s+event_count/i.test(query));
  assert.ok(eventCountUpdate);
  const ownerQuery = db.selectCalls.find(({ query }) => /WITH\s+session_metrics\s+AS/i.test(query));
  assert.ok(ownerQuery);
  assert.match(ownerQuery.query, /SUM\(s\.event_count\)/i);
  assert.doesNotMatch(ownerQuery.query, /COUNT\(DISTINCT\s+e\.event_key\)/i);
});

test("回算读取快照后实时 paidTotal 更新不会被旧回算值覆盖", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new InterleavedPaidTotalDatabase({
    sessions: [{ sessionId: "session-history", ownerId: "room:101", paidTotal: 0, updatedAt: 1 }],
    events: createHistoricalPaymentDatabase().events,
  });
  const repository = new ArchiveRepository(db);
  const recomputePromise = repository.recomputePaidTotals();

  await db.snapshotRead;
  await repository.updateSession({ sessionId: "session-history", paidTotal: 2, updatedAt: 200 });
  db.releaseSnapshot();

  assert.equal(await recomputePromise, 0);
  assert.equal(db.sessions.get("session-history").paidTotal, 2);
});

test("appendEvents 使用参数绑定、单事务和稳定事件键去重", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  const inserted = await repository.appendEvents([eventInput]);

  assert.equal(inserted, 1);
  assert.equal(db.executeCalls[0].query, "BEGIN");
  assert.equal(db.executeCalls.at(-1).query, "COMMIT");
  const insertCall = db.executeCalls.find(({ query }) => query.includes("INSERT INTO archive_event"));
  assert.ok(insertCall);
  assert.match(insertCall.query, /ON CONFLICT\s*\(event_key\)\s*DO NOTHING/i);
  assert.ok(insertCall.bindValues.includes(eventInput.eventKey));
  assert.ok(insertCall.bindValues.includes(JSON.stringify(eventInput.payload)));
  assert.doesNotMatch(insertCall.query, /event-1|你好/);
});

test("appendEvents 失败时回滚整批写入", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  db.failWhen = /archive_search_index/;
  const repository = new ArchiveRepository(db);

  await assert.rejects(() => repository.appendEvents([eventInput]), /fake database failure/);
  assert.equal(db.executeCalls.at(-1).query, "ROLLBACK");
});

test("同一数据库连接上的回算要等待档案写入事务完成", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new ConcurrentTransactionDatabase();
  const repository = new ArchiveRepository(database);

  const appendPromise = repository.appendEvents([eventInput]);
  await database.transactionStarted;
  const recomputePromise = repository.recomputePaidTotals();

  database.resolveEventInsert();
  await assert.doesNotReject(async () => {
    await Promise.all([appendPromise, recomputePromise]);
  });
  assert.equal(database.executeCalls.filter(({ query }) => query === "BEGIN").length, 2);
});

test("不同 Repository 实例共享同一 SQLite 连接时也串行事务", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new ConcurrentTransactionDatabase();
  const writerRepository = new ArchiveRepository(database);
  const readerRepository = new ArchiveRepository(database);

  const appendPromise = writerRepository.appendEvents([eventInput]);
  await database.transactionStarted;
  const recomputePromise = readerRepository.recomputePaidTotals();

  database.resolveEventInsert();
  await assert.doesNotReject(async () => {
    await Promise.all([appendPromise, recomputePromise]);
  });
  assert.equal(database.executeCalls.filter(({ query }) => query === "BEGIN").length, 2);
});

test("appendEvents 通过单一后端事务入口提交，不再经插件连接发送事务控制语句", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new TransactionAwareDatabase();
  const repository = new ArchiveRepository(db);

  await repository.appendEvents([eventInput]);

  assert.equal(db.transactionCalls.length, 1);
  assert.ok(db.transactionCalls[0].length >= 2);
  assert.equal(db.executeCalls.some(({ query }) => query === "BEGIN"), false);
  assert.equal(db.executeCalls.some(({ query }) => query === "COMMIT"), false);
});

test("queryEvents 使用游标分页并返回下一页游标", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[
      {
        eventKey: "event-1",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 0,
        eventTs: 100,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        userUid: "user-1",
        userName: "昵称",
        searchText: "hello",
        payloadJson: "{\"id\":\"event-1\"}",
        sourceId: null,
        favorited: 1,
      },
      {
        eventKey: "event-2",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 1,
        eventTs: 101,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        userUid: "user-2",
        userName: "另一个昵称",
        searchText: "world",
        payloadJson: "{\"id\":\"event-2\"}",
        sourceId: null,
      },
      {
        eventKey: "event-3",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 2,
        eventTs: 102,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        userUid: "user-3",
        userName: "第三个昵称",
        searchText: "tail",
        payloadJson: "{\"id\":\"event-3\"}",
        sourceId: null,
      },
    ], [{ totalCount: 3 }]],
  });
  const repository = new ArchiveRepository(db);

  const page = await repository.queryEvents({ sessionId: "session-1", limit: 2, includeTotal: true });

  assert.equal(page.items.length, 2);
  assert.equal(page.items[0].eventKey, "event-1");
  assert.equal(page.items[0].favorited, true);
  assert.equal(typeof page.nextCursor, "string");
  assert.equal(page.totalCount, 3);
  assert.match(db.selectCalls[0].query, /LIMIT\s+\$\d+/i);
  assert.ok(db.selectCalls[0].bindValues.includes("session-1"));
});

test("listSessions 支持 offset 分页以访问超过首批上限的档案", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({ selectResults: [[]] });
  const repository = new ArchiveRepository(db);

  await repository.listSessions({ ownerId: "room:101", limit: 51, offset: 500 });

  assert.match(db.selectCalls[0].query, /LIMIT\s+\$\d+\s+OFFSET\s+\$\d+/i);
  assert.deepEqual(db.selectCalls[0].bindValues.slice(-2), [51, 500]);
});

test("findResumableSession 只恢复同房间同开播时间的 active 或 unclean 场次", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-recover",
      ownerId: "room:101",
      roomId: 101,
      title: "标题",
      latestTitle: "标题",
      titleSource: "bilibili",
      liveKey: null,
      subSessionKey: null,
      sourceLiveStartedAt: 1_700_000_000_000,
      identityEvidence: "source-live-time",
      startedAt: 1_700_000_000_000,
      endedAt: null,
      status: "unclean",
      quality: "incomplete",
      qualityReason: "previous-runtime",
      eventCount: 42,
      paidTotal: 12.5,
      favoriteCount: 0,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    }]],
  });
  const repository = new ArchiveRepository(db);

  const session = await repository.findResumableSession(101, 1_700_000_000_000);

  assert.equal(session?.sessionId, "session-recover");
  assert.equal(session?.eventCount, 42);
  assert.equal(session?.paidTotal, 12.5);
  assert.match(db.selectCalls[0].query, /s\.room_id\s*=\s*\$\d+/i);
  assert.match(db.selectCalls[0].query, /s\.source_live_started_at\s*=\s*\$\d+/i);
  assert.match(db.selectCalls[0].query, /s\.status\s+IN\s*\('active',\s*'unclean'\)/i);
  assert.deepEqual(db.selectCalls[0].bindValues.slice(0, 2), [101, 1_700_000_000_000]);
});

test("getNextEventOrdinal 从事件表读取持久化的下一个序号", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({ selectResults: [[{ nextOrdinal: 14_941 }]] });
  const repository = new ArchiveRepository(db);

  const nextOrdinal = await repository.getNextEventOrdinal("session-recover");

  assert.equal(nextOrdinal, 14_941);
  assert.match(db.selectCalls[0].query, /MAX\(ordinal\)\s*\+\s*1/i);
  assert.deepEqual(db.selectCalls[0].bindValues, ["session-recover"]);
});

test("相同时间戳的定位锚点按 ordinal 和 eventKey 做字典序比较", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{ eventTs: 100, ordinal: 350, eventKey: "target" }], []],
  });
  const repository = new ArchiveRepository(db);

  await repository.queryEvents({
    sessionId: "session-1",
    direction: "asc",
    limit: 320,
    anchor: { eventKey: "target", fallbackEventTs: 100 },
  });

  const query = db.selectCalls[1].query;
  assert.match(query, /e\.event_ts\s*>\s*\$\d+/i);
  assert.match(query, /e\.event_ts\s*=\s*\$\d+\s+AND\s+e\.ordinal\s*>\s*\$\d+/i);
  assert.match(query, /e\.event_ts\s*=\s*\$\d+\s+AND\s+e\.ordinal\s*=\s*\$\d+\s+AND\s+e\.event_key\s*>=\s*\$\d+/i);
  assert.doesNotMatch(query, /e\.event_ts\s*>=\s*\$\d+/i);
});

test("desc 首页生成的 nextCursor 在省略 direction 的续页中保持倒序", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[
      {
        eventKey: "event-3",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 2,
        eventTs: 102,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        searchText: "tail",
        payloadJson: "{}",
      },
      {
        eventKey: "event-2",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 1,
        eventTs: 101,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        searchText: "middle",
        payloadJson: "{}",
      },
      {
        eventKey: "event-1",
        sessionId: "session-1",
        roomId: 101,
        ordinal: 0,
        eventTs: 100,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        searchText: "head",
        payloadJson: "{}",
      },
    ], []],
  });
  const repository = new ArchiveRepository(db);

  const firstPage = await repository.queryEvents({
    sessionId: "session-1",
    direction: "desc",
    limit: 2,
  });
  await repository.queryEvents({
    sessionId: "session-1",
    cursor: firstPage.nextCursor,
    limit: 2,
  });

  assert.equal(firstPage.items[0].eventKey, "event-3");
  assert.ok(firstPage.nextCursor);
  assert.match(
    db.selectCalls[1].query,
    /ORDER BY e\.event_ts DESC, e\.ordinal DESC, e\.event_key DESC/,
  );
});

test("同一 session 的 reading state 写入串行完成，旧写入不能晚到覆盖新状态", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new OrderedReadingStateDatabase();
  const repository = new ArchiveRepository(database);
  const state = (eventKey, updatedAt) => ({
    sessionId: "session-ordered",
    eventKey,
    fallbackEventTs: updatedAt,
    sortDirection: "asc",
    filters: {},
    searchScope: "session",
    updatedAt,
  });

  const first = repository.saveReadingState(state("old", 1));
  const second = repository.saveReadingState(state("new", 2));
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(database.readingWrites.length, 1);
    database.resolveWrite(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(database.readingWrites.length, 2);
    database.resolveWrite(1);
    await Promise.all([first, second]);
    assert.deepEqual(database.readingWrites.map(({ bindValues }) => bindValues[1]), ["old", "new"]);
  } finally {
    for (const write of database.readingWrites) write.resolve({ rowsAffected: 1 });
    await Promise.allSettled([first, second]);
  }
});

test("owner 历史事件查询带出场次边界所需的日期、标题和质量", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new FakeDatabase({ selectResults: [[{
    eventKey: "event-history",
    sessionId: "session-history",
    roomId: 101,
    ordinal: 0,
    eventTs: 100,
    primaryCategory: "danmu",
    secondaryCategory: null,
    searchText: "hello",
    payloadJson: "{}",
    sessionTitle: "历史标题",
    sessionStartedAt: 80,
    sessionEndedAt: 120,
    sessionQuality: "complete",
  }]] });
  const repository = new ArchiveRepository(database);

  const page = await repository.queryEvents({ ownerId: "room:101", direction: "asc" });
  const query = database.selectCalls.at(-1);
  assert.match(query.query, /s\.title AS sessionTitle/i);
  assert.match(query.query, /s\.started_at AS sessionStartedAt/i);
  assert.match(query.query, /s\.quality AS sessionQuality/i);
  assert.equal(page.items[0].sessionTitle, "历史标题");
  assert.equal(page.items[0].sessionStartedAt, 80);
  assert.equal(page.items[0].sessionEndedAt, 120);
  assert.equal(page.items[0].sessionQuality, "complete");
});

test("updateSession 将 sessionId 绑定到 WHERE 条件而不是更新字段", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.updateSession({ sessionId: "session-1", title: "新标题", status: "ended" });

  const updateCall = db.executeCalls.find(({ query }) => /UPDATE archive_session/i.test(query));
  assert.match(updateCall.query, /WHERE session_id = \$\d+$/);
  assert.equal(updateCall.bindValues.at(-1), "session-1");
  assert.doesNotMatch(updateCall.query, /session_id = session_id/);
});

test("updateEvent 将 SC 删除标记写回原事件 payload，而不是新增事件", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.updateEvent({ eventKey: "session-1:archive-event:sc-1", patch: { scDeleted: true } });

  const updateCall = db.executeCalls.find(({ query }) => /UPDATE archive_event/i.test(query));
  assert.match(updateCall.query, /UPDATE archive_event/);
  assert.match(updateCall.query, /json_set\(payload_json/);
  assert.deepEqual(updateCall.bindValues, ["session-1:archive-event:sc-1"]);
});

test("损坏的 filters_json 以明确错误失败，而不是静默恢复为空筛选", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-1",
      eventKey: null,
      fallbackEventTs: null,
      sortDirection: "asc",
      filtersJson: "{broken",
      searchScope: "session",
      updatedAt: 200,
    }]],
  });
  const repository = new ArchiveRepository(db);

  await assert.rejects(
    () => repository.getReadingState("session-1"),
    /Invalid archive reading state filters.*session-1/,
  );
});

test("Repository 的状态与删除接口都通过绑定参数工作", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-1",
      eventKey: "event-1",
      fallbackEventTs: 100,
      sortDirection: "desc",
      filtersJson: '{"favoriteOnly":true}',
      searchScope: "owner",
      updatedAt: 200,
    }], [{
      ownerCount: 1,
      sessionCount: 2,
      eventCount: 7,
      favoriteCount: 3,
      bytes: 456,
      sessionIds: "session-1,session-2",
      blockedSessionStatuses: "",
      sessionSnapshots: JSON.stringify([
        { sessionId: "session-1", ownerId: "owner-1", status: "ended", updatedAt: 201, quality: "complete" },
        { sessionId: "session-2", ownerId: "owner-1", status: "ended", updatedAt: 202, quality: "incomplete" },
      ]),
    }]],
  });
  const repository = new ArchiveRepository(db);

  await repository.setFavorite("event-1", true);
  await repository.setFavorite("event-1", false);
  await repository.setNickname("user-1", "新昵称");
  const readingState = await repository.getReadingState("session-1");
  await repository.saveReadingState({
    sessionId: "session-1",
    eventKey: "event-1",
    fallbackEventTs: 100,
    sortDirection: "desc",
    filters: { favoriteOnly: true },
    searchScope: "owner",
    updatedAt: 200,
  });
  const preview = await repository.getDeletePreview({ beforeTs: 300, ownerId: "owner-1" });
  await repository.deleteBefore({ beforeTs: 300, ownerId: "owner-1" });
  await repository.deleteSession("session-1");

  assert.deepEqual(readingState, {
    sessionId: "session-1",
    eventKey: "event-1",
    fallbackEventTs: 100,
    sortDirection: "desc",
    filters: { favoriteOnly: true },
    searchScope: "owner",
    updatedAt: 200,
  });
  assert.deepEqual(preview, {
    ownerCount: 1,
    sessionCount: 2,
    eventCount: 7,
    favoriteCount: 3,
    sessionIds: ["session-1", "session-2"],
    sessionSnapshots: [
      { sessionId: "session-1", ownerId: "owner-1", status: "ended", updatedAt: 201, quality: "complete" },
      { sessionId: "session-2", ownerId: "owner-1", status: "ended", updatedAt: 202, quality: "incomplete" },
    ],
    resourceReferenceCount: 0,
    bytes: 456,
    blockedSessionCount: 0,
    blockedSessionIds: [],
    blockedSessionStates: [],
  });
  assert.ok(db.executeCalls.every(({ bindValues }) => Array.isArray(bindValues)));
  assert.ok(db.executeCalls.some(({ query, bindValues }) => query.includes("DELETE FROM archive_session") && bindValues.includes("session-1")));
  assert.ok(db.selectCalls.some(({ bindValues }) => bindValues.includes("owner-1")));
});

test("删除预览按 owner UID 返回收藏、资源引用和进行中阻塞计数", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      ownerCount: 1,
      sessionCount: 2,
      eventCount: 7,
      favoriteCount: 3,
      resourceReferenceCount: 5,
      bytes: 456,
      blockedSessionCount: 1,
      blockedSessionIds: "session-live",
      sessionIds: "session-1,session-2",
      blockedSessionStatuses: "active",
      blockedRecordingStatuses: 'recording',
      sessionSnapshots: JSON.stringify([
        { sessionId: "session-1", ownerId: "owner-1", status: "ended", updatedAt: 201, quality: "complete" },
        { sessionId: "session-2", ownerId: "owner-1", status: "ended", updatedAt: 202, quality: "complete" },
        { sessionId: "session-live", ownerId: "owner-1", status: "active", updatedAt: 203, quality: "in-progress" },
      ]),
    }], [
      { payloadJson: '{"url":"https://img.example/1.png"}' },
      { payloadJson: '{"url":"https://img.example/2.png"}' },
      { payloadJson: '{"url":"https://img.example/3.png"}' },
      { payloadJson: '{"url":"https://img.example/4.png"}' },
      { payloadJson: '{"url":"https://img.example/5.png"}' },
    ]],
  });
  const repository = new ArchiveRepository(db);

  const preview = await repository.getDeletePreview({ ownerUid: "anchor-1", beforeTs: 300 });

  assert.deepEqual(preview, {
    ownerCount: 1,
    sessionCount: 2,
    eventCount: 7,
    favoriteCount: 3,
    sessionIds: ["session-1", "session-2"],
    sessionSnapshots: [
      { sessionId: "session-1", ownerId: "owner-1", status: "ended", updatedAt: 201, quality: "complete" },
      { sessionId: "session-2", ownerId: "owner-1", status: "ended", updatedAt: 202, quality: "complete" },
      { sessionId: "session-live", ownerId: "owner-1", status: "active", updatedAt: 203, quality: "in-progress" },
    ],
    resourceReferenceCount: 5,
    bytes: 456,
    blockedSessionCount: 1,
    blockedSessionIds: ["session-live"],
    blockedSessionStates: [{ sessionId: "session-live", status: "active", recordingStatus: 'recording' }],
  });
  const query = db.selectCalls[0];
  assert.match(query.query, /JOIN archive_owner o ON o\.owner_id = s\.owner_id/i);
  assert.ok(query.bindValues.includes("anchor-1"));
  assert.match(query.query, /recording_status\s*=\s*'stopped'/i);
  assert.doesNotMatch(query.query, /status\s*<>\s*'unclean'/i);
  assert.match(query.query, /recording_status\s+IN\s*\('recording',\s*'reconnecting'\)/i);
  assert.doesNotMatch(query.query, /status\s*=\s*'unclean'/i);
});

test("删除预览复用递归 URL 提取并按唯一 escaped URL 计数", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [
      [{
        sessionCount: 1,
        eventCount: 2,
        favoriteCount: 0,
        resourceReferenceCount: 0,
        bytes: 200,
        sessionIds: "session-1",
        blockedSessionCount: 0,
        blockedSessionIds: "",
        blockedSessionStatuses: "",
        sessionSnapshots: JSON.stringify([
          { sessionId: "session-1", ownerId: "owner-1", status: "ended", updatedAt: 201, quality: "complete" },
        ]),
      }],
      [
        { payloadJson: '{"url":"https:\\/\\/img.example\\/escaped.png"}' },
        { payloadJson: '{"url":"https://img.example/escaped.png"}' },
      ],
    ],
  });
  const repository = new ArchiveRepository(db);

  const preview = await repository.getDeletePreview({ sessionId: "session-1" });

  assert.equal(preview.resourceReferenceCount, 1);
});

test("确认删除在数据库失败时回滚整笔事务", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  db.failWhen = /DELETE FROM archive_session/i;
  const repository = new ArchiveRepository(db);

  await assert.rejects(
    () => repository.deleteArchive({ sessionId: "session-1" }),
    /fake database failure/,
  );
  assert.equal(db.executeCalls[0].query, "BEGIN");
  assert.equal(db.executeCalls.at(-1).query, "ROLLBACK");
});

test("确认删除按预览 session IDs 校验后再删除，而不是重新按宽 scope 扩大", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{ sessionId: "session-1", status: "ended" }]],
  });
  const repository = new ArchiveRepository(db);

  await repository.deleteArchive({ ownerId: "owner-1", beforeTs: 300 }, ["session-1"]);

  const deletion = db.executeCalls.find(({ query }) => /DELETE FROM archive_session/i.test(query));
  assert.match(deletion.query, /session_id IN/i);
  assert.ok(deletion.bindValues.includes("session-1"));
});

test("删除预览支持主播内指定多个 session IDs，并只生成精确集合条件", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      sessionCount: 2,
      ownerCount: 1,
      eventCount: 0,
      favoriteCount: 0,
      bytes: 0,
      sessionIds: "session-1,session-2",
      blockedSessionCount: 0,
      blockedSessionIds: "",
      blockedSessionStatuses: "",
      sessionSnapshots: "[]",
    }], []],
  });
  const repository = new ArchiveRepository(db);

  await repository.getDeletePreview({ ownerId: "owner-1", sessionIds: ["session-1", "session-2"] });

  const previewQuery = db.selectCalls[0];
  assert.match(previewQuery.query, /s\.session_id IN/i);
  assert.ok(previewQuery.bindValues.includes("session-1"));
  assert.ok(previewQuery.bindValues.includes("session-2"));
});

test("删除目标在复核到删除之间变化时，事务边界内拒绝少删并回滚", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new DeleteRaceDatabase();
  const repository = new ArchiveRepository(db);

  await assert.rejects(
    () => repository.deleteArchive({ ownerId: "owner-1", beforeTs: 300 }, ["session-1"]),
    /删除目标已变化|unexpected affected row count/,
  );
  assert.equal(db.selectCalls.length, 0);
  const deletion = db.transactionCalls[0]?.find(({ sql }) => /DELETE FROM archive_session/i.test(sql));
  assert.match(deletion?.sql ?? "", /SELECT COUNT\(\*\)/i);
  assert.equal(deletion?.values.at(-1), 1);
});

test("宽范围删除只删除已停止记录的场次", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.deleteBefore({ ownerId: "owner-1", beforeTs: 300 });

  const deletion = db.executeCalls.find(({ query }) => /DELETE FROM archive_session/i.test(query));
  assert.ok(deletion);
  assert.match(deletion.query, /s\.recording_status\s*=\s*'stopped'/i);
  assert.doesNotMatch(deletion.query, /s\.status\s*<>\s*'unclean'/i);
});

test("全部档案删除使用显式无边界范围，同时保护运行中的记录", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.deleteArchive({ all: true });

  const deletion = db.executeCalls.find(({ query }) => /DELETE FROM archive_session/i.test(query));
  assert.ok(deletion);
  assert.match(deletion.query, /1\s*=\s*1/);
  assert.match(deletion.query, /s\.recording_status\s*=\s*'stopped'/i);
  assert.doesNotMatch(deletion.query, /s\.status\s*<>\s*'unclean'/i);
});

test("删除范围不能通过 includeActive 覆盖记录保护", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.deleteBefore({ ownerId: "owner-1", beforeTs: 300, includeActive: true });

  const deletion = db.executeCalls.find(({ query }) => /DELETE FROM archive_session/i.test(query));
  assert.ok(deletion);
  assert.match(deletion.query, /s\.recording_status\s*=\s*'stopped'/i);
});

test("导入写入失败时回滚整笔事务", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  db.failWhen = /INSERT INTO archive_event/i;
  const repository = new ArchiveRepository(db);

  await assert.rejects(
    () => repository.commitArchiveImport({
      sourceId: "transfer-1",
      counts: {
        ownerCount: 1,
        sessionCount: 1,
        imported: 1,
        newEvents: 1,
        skipped: 0,
        completedFields: 0,
        conflicts: 0,
        unmatched: 0,
      },
      owners: [{
        ownerId: "owner-1",
        roomId: 1,
        uid: "uid-1",
        name: "主播",
        avatarUrl: null,
        createdAt: 1,
        updatedAt: 1,
      }],
      sessionCreates: [{
        sessionId: "session-1",
        ownerId: "owner-1",
        roomId: 1,
        title: "场次",
        startedAt: 1,
        endedAt: 2,
        status: "ended",
        quality: "complete",
        qualityReason: null,
        eventCount: 1,
        paidTotal: 0,
        favoriteCount: 0,
        createdAt: 1,
        updatedAt: 2,
      }],
      sessionPatches: [],
      newEvents: [{
        eventKey: "session-1:archive-event:event-1",
        sessionId: "session-1",
        roomId: 1,
        ordinal: 0,
        eventTs: 1,
        primaryCategory: "danmu",
        secondaryCategory: "text",
        userUid: null,
        userName: null,
        searchText: "内容",
        payloadJson: JSON.stringify({ id: "event-1" }),
        sourceId: "local",
      }],
      favorites: [],
      nicknames: [],
      readingStates: [],
      historicalFavorites: [],
      affectedSessionIds: [],
    }),
    /fake database failure/,
  );
  assert.equal(db.executeCalls[0].query, "BEGIN");
  assert.equal(db.executeCalls.at(-1).query, "ROLLBACK");
  assert.equal(db.executeCalls.some(({ query }) => query === "COMMIT"), false);
});

test("并发导入按事务内当前 owner 解析，不因过期 room owner 读取失败", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new ConcurrentOwnerImportDatabase();
  const repository = new ArchiveRepository(db);

  const results = await Promise.allSettled([
    repository.commitArchiveImport(createConcurrentImportPlan("transfer-1", "owner-1")),
    repository.commitArchiveImport(createConcurrentImportPlan("transfer-2", "owner-2")),
  ]);

  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"]);
  assert.equal(db.selectCalls.length, 0);
  assert.equal(db.ownerByRoom.get(101), "owner-1");
  assert.equal(db.transactionCalls.length, 2);
});

test("setFavorite 将收藏关系和 session favorite_count 放在同一事务", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  const repository = new ArchiveRepository(db);

  await repository.setFavorite("session-1:archive-event:event-1", true);

  assert.equal(db.executeCalls[0].query, "BEGIN");
  assert.equal(db.executeCalls.at(-1).query, "COMMIT");
  assert.ok(db.executeCalls.some(({ query }) => query.includes("INSERT INTO archive_favorite")));
  assert.ok(db.executeCalls.some(({ query }) => query.includes("UPDATE archive_session")));
});

test("setFavorite 任一步失败都会回滚关系与 session 计数更新", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase();
  db.failWhen = /^UPDATE archive_session/;
  const repository = new ArchiveRepository(db);

  await assert.rejects(
    () => repository.setFavorite("session-1:archive-event:event-1", true),
    /fake database failure/,
  );
  assert.equal(db.executeCalls[0].query, "BEGIN");
  assert.equal(db.executeCalls.at(-1).query, "ROLLBACK");
  assert.equal(db.executeCalls.some(({ query }) => query === "COMMIT"), false);
});

test("创建已有名称的收藏标签会复用标签而不是报重复错误", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase({
    selectResults: [[{
      tagId: 2,
      name: "待复盘",
      createdAt: 1,
      updatedAt: 2,
    }]],
  });
  const repository = new ArchiveRepository(db);

  const created = await repository.createFavoriteTag("待复盘");

  assert.equal(created.name, "待复盘");
  const insert = db.executeCalls.find(({ query }) => /INSERT INTO archive_favorite_tag/i.test(query));
  assert.match(insert.query, /ON CONFLICT\(name\) DO UPDATE/i);
});

test("历史未知收藏保存原快照、稳定键和标签，并可重新读取", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const event = {
    id: "legacy-event",
    msgType: 0,
    roomId: 101,
    ts: 1_700_000_000_000,
    user: { uid: "user-1", uname: "历史用户名" },
    text: "历史内容",
  };
  const db = new FakeDatabase({
    selectResults: [[{
      legacyKey: "101:event:legacy-event",
      roomId: 101,
      eventId: "legacy-event",
      eventJson: JSON.stringify(event),
      favoritedAt: 1_700_000_001_000,
      label: "历史收藏（场次未知）",
    }]],
  });
  const repository = new ArchiveRepository(db);

  await repository.saveHistoricalFavorite({
    legacyKey: "101:event:legacy-event",
    roomId: 101,
    eventId: "legacy-event",
    event,
    favoritedAt: 1_700_000_001_000,
    label: "历史收藏（场次未知）",
    note: "",
  });
  const insertCall = db.executeCalls.find(({ query }) => /INSERT INTO archive_historical_favorite/i.test(query));
  assert.match(insertCall.query, /INSERT INTO archive_historical_favorite/);
  assert.ok(insertCall.bindValues.includes("101:event:legacy-event"));
  assert.ok(insertCall.bindValues.includes(JSON.stringify(event)));

  const records = await repository.listHistoricalFavorites();
  assert.deepEqual(records, [{
    legacyKey: "101:event:legacy-event",
    roomId: 101,
    eventId: "legacy-event",
    event,
    favoritedAt: 1_700_000_001_000,
    label: "历史收藏（场次未知）",
    note: "",
    tags: [],
  }]);
});

test("主播事件检索按场次返回命中数和有上限的摘要", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-1",
      ownerId: "owner-1",
      roomId: 101,
      title: "直播标题",
      startedAt: 100,
      endedAt: 500,
      status: "ended",
      quality: "complete",
      qualityReason: null,
      matchCount: 23,
      latestMatchTs: 450,
    }], [{
      eventKey: "event-1",
      sessionId: "session-1",
      roomId: 101,
      ordinal: 1,
      eventTs: 200,
      primaryCategory: "danmu",
      secondaryCategory: "text",
      userUid: "u1",
      userName: "用户甲",
      searchText: "用户甲 关注",
      payloadJson: "{}",
      sourceId: null,
      favorited: 0,
    }]],
  });
  const repository = new ArchiveRepository(database);

  const page = await repository.queryOwnerEventGroups({
    ownerId: "owner-1",
    filters: { keywordConditions: [{ field: "content", value: "关注" }] },
    previewLimit: 3,
    groupLimit: 50,
  });

  assert.equal(page.items[0].session.sessionId, "session-1");
  assert.equal(page.items[0].matchCount, 23);
  assert.equal(page.items[0].latestMatchTs, 450);
  assert.equal(page.items[0].matches[0].eventKey, "event-1");
  assert.equal(page.items[0].matches.length, 1);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextOffset, null);

  const previewQuery = database.selectCalls[1];
  assert.match(previewQuery.query, /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY e\.session_id\s+ORDER BY e\.event_ts ASC,\s*e\.ordinal ASC,\s*e\.event_key ASC\s*\)/i);
  assert.ok(previewQuery.bindValues.includes(3));
  assert.ok(database.selectCalls[0].bindValues.includes("owner-1"));
  assert.ok(database.selectCalls[0].bindValues.includes("%关注%"));
  assert.doesNotMatch(database.selectCalls[0].query, /关注/);
});

test("主播事件检索的日期范围只按事件时间过滤", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-1",
      ownerId: "owner-1",
      roomId: 101,
      startedAt: 50,
      endedAt: 500,
      status: "ended",
      quality: "complete",
      matchCount: 2,
      latestMatchTs: 400,
    }], []],
  });
  const repository = new ArchiveRepository(database);

  await repository.queryOwnerEventGroups({
    ownerId: "owner-1",
    filters: { fromTs: 100, toTs: 200 },
  });

  for (const query of database.selectCalls) {
    assert.match(query.query, /e\.event_ts\s*>=\s*\$\d+/i);
    assert.match(query.query, /e\.event_ts\s*<\s*\$\d+/i);
    assert.doesNotMatch(query.query, /s\.started_at\s*(?:>=|<)/i);
    assert.ok(query.bindValues.includes(100));
    assert.ok(query.bindValues.includes(200));
  }
});

test("主播事件检索按场次偏移分页并显式报告后续页", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const sessionRow = (sessionId, startedAt, matchCount, latestMatchTs) => ({
    sessionId,
    ownerId: "owner-1",
    roomId: 101,
    title: sessionId,
    startedAt,
    endedAt: startedAt + 100,
    status: "ended",
    quality: "complete",
    matchCount,
    latestMatchTs,
  });
  const previewRow = (sessionId, eventKey, eventTs) => ({
    eventKey,
    sessionId,
    roomId: 101,
    ordinal: 1,
    eventTs,
    primaryCategory: "danmu",
    secondaryCategory: "text",
    userUid: null,
    userName: null,
    searchText: eventKey,
    payloadJson: "{}",
    sourceId: null,
    favorited: 0,
  });
  const database = new FakeDatabase({
    selectResults: [
      [
        sessionRow("session-1", 100, 4, 190),
        sessionRow("session-2", 200, 3, 180),
        sessionRow("session-3", 300, 2, 170),
      ],
      [previewRow("session-1", "event-1", 120), previewRow("session-2", "event-2", 130)],
      [sessionRow("session-3", 300, 2, 170)],
      [previewRow("session-3", "event-3", 140)],
    ],
  });
  const repository = new ArchiveRepository(database);
  const query = {
    ownerId: "owner-1",
    filters: {},
    sort: "latestMatch",
    direction: "desc",
    groupLimit: 2,
    previewLimit: 1,
  };

  const firstPage = await repository.queryOwnerEventGroups(query);
  const secondPage = await repository.queryOwnerEventGroups({
    ...query,
    offset: firstPage.nextOffset,
  });

  assert.deepEqual(firstPage.items.map((item) => item.session.sessionId), ["session-1", "session-2"]);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextOffset, 2);
  assert.deepEqual(secondPage.items.map((item) => item.session.sessionId), ["session-3"]);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextOffset, null);

  const firstAggregateQuery = database.selectCalls[0];
  const secondAggregateQuery = database.selectCalls[2];
  assert.match(firstAggregateQuery.query, /ORDER BY (?:MAX\(e\.event_ts\)|latestMatchTs) DESC,\s*s\.session_id ASC/i);
  assert.match(firstAggregateQuery.query, /LIMIT \$\d+ OFFSET \$\d+/i);
  assert.deepEqual(firstAggregateQuery.bindValues.slice(-2), [3, 0]);
  assert.deepEqual(secondAggregateQuery.bindValues.slice(-2), [3, 2]);
  assert.ok(database.selectCalls[1].bindValues.includes("session-1"));
  assert.ok(database.selectCalls[1].bindValues.includes("session-2"));
  assert.equal(database.selectCalls[1].bindValues.includes("session-3"), false);
});

test("主播事件筛选作用于同一候选事件，收藏限定事件且排除分类不排除场次", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new FakeDatabase({
    selectResults: [[{
      sessionId: "session-1",
      ownerId: "owner-1",
      roomId: 101,
      startedAt: 100,
      endedAt: 300,
      status: "ended",
      quality: "complete",
      matchCount: 1,
      latestMatchTs: 200,
    }], []],
  });
  const repository = new ArchiveRepository(database);

  await repository.queryOwnerEventGroups({
    ownerId: "owner-1",
    filters: {
      favoriteOnly: true,
      filterMode: "exclude",
      primaryCategories: ["interact"],
      keywordConditions: [
        { field: "user", value: "主播甲" },
        { field: "content", value: "关注", join: "and" },
      ],
    },
  });

  const candidateQuery = database.selectCalls[0];
  assert.match(candidateQuery.query, /af\.event_key IS NOT NULL/i);
  assert.match(candidateQuery.query, /e\.primary_category NOT IN \(\$\d+\)/i);
  assert.match(candidateQuery.query, /COALESCE\(e\.user_name,[\s\S]*AND[\s\S]*e\.search_text/i);
  assert.doesNotMatch(candidateQuery.query, /NOT EXISTS/i);
  assert.doesNotMatch(candidateQuery.query, /主播甲|关注|interact/);
  assert.ok(candidateQuery.bindValues.includes("%主播甲%"));
  assert.ok(candidateQuery.bindValues.includes("%关注%"));
  assert.ok(candidateQuery.bindValues.includes("interact"));
});

test("主播事件检索排序只使用固定列，且分页与摘要限制有默认值和上限", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const sessionRow = {
    sessionId: "session-1",
    ownerId: "owner-1",
    roomId: 101,
    startedAt: 100,
    endedAt: 200,
    status: "ended",
    quality: "complete",
    matchCount: 2,
    latestMatchTs: 180,
  };
  const database = new FakeDatabase({
    selectResults: [
      [sessionRow], [],
      [sessionRow], [],
      [sessionRow], [],
      [sessionRow], [],
      [sessionRow], [],
      [sessionRow], [],
    ],
  });
  const repository = new ArchiveRepository(database);

  for (const [sort, pattern] of [
    ["latestMatch", /ORDER BY (?:MAX\(e\.event_ts\)|latestMatchTs) DESC,\s*s\.session_id ASC/i],
    ["sessionStartedAt", /ORDER BY s\.started_at DESC,\s*s\.session_id ASC/i],
    ["matchCount", /ORDER BY (?:COUNT\(\*\)|matchCount) DESC,\s*s\.session_id ASC/i],
  ]) {
    await repository.queryOwnerEventGroups({
      ownerId: "owner-1",
      filters: {},
      sort,
      direction: "desc",
    });
    assert.match(database.selectCalls.at(-2).query, pattern);
  }

  await repository.queryOwnerEventGroups({ ownerId: "owner-1", filters: {} });
  await repository.queryOwnerEventGroups({
    ownerId: "owner-1",
    filters: {},
    groupLimit: 300,
    previewLimit: 20,
  });
  await repository.queryOwnerEventGroups({
    ownerId: "owner-1",
    filters: {},
    groupLimit: 1,
    previewLimit: 0,
  });

  const defaultAggregateQuery = database.selectCalls[6];
  assert.deepEqual(defaultAggregateQuery.bindValues.slice(-2), [51, 0]);
  assert.equal(database.selectCalls[7].bindValues.at(-1), 3);
  const cappedAggregateQuery = database.selectCalls[8];
  assert.deepEqual(cappedAggregateQuery.bindValues.slice(-2), [201, 0]);
  assert.equal(database.selectCalls[9].bindValues.at(-1), 3);
  const lowerBoundedAggregateQuery = database.selectCalls[10];
  assert.deepEqual(lowerBoundedAggregateQuery.bindValues.slice(-2), [2, 0]);
  assert.equal(database.selectCalls[11].bindValues.at(-1), 1);
});
