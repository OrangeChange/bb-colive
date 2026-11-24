import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

export const acceptanceScale = { owners: 12, sessions: 24, events: 12000, favorites: 240, historicalFavorites: 205 };
const epoch = 1760000000000;

export function sqliteAdapter(db) {
  const reads = [], writes = [];
  const bind = (values) => Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]));
  return {
    reads, writes,
    reset() { reads.length = 0; writes.length = 0; },
    async select(sql, values = []) {
      const rows = db.prepare(sql).all(bind(values));
      reads.push({ sql, rows: rows.length });
      return rows;
    },
    async execute(sql, values = []) {
      const result = db.prepare(sql).run(bind(values));
      writes.push({ sql, changes: Number(result.changes) });
      return { rowsAffected: Number(result.changes) };
    },
    async executeTransaction(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await this.execute(statement.sql, statement.values));
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

export function createAcceptanceFixture(path, schemaStatements) {
  const db = new DatabaseSync(path);
  for (const sql of schemaStatements) {
    if (/PRAGMA user_version/.test(sql)) continue;
    db.exec(sql.includes('CREATE TABLE IF NOT EXISTS archive_historical_favorite (')
      ? `CREATE TABLE archive_historical_favorite (legacy_key TEXT PRIMARY KEY, room_id INTEGER NOT NULL,
        event_id TEXT NOT NULL, event_json TEXT NOT NULL, favorited_at INTEGER NOT NULL,
        label TEXT NOT NULL, note TEXT NOT NULL DEFAULT '')`
      : sql);
  }
  db.exec('PRAGMA user_version = 6; BEGIN');
  const owner = db.prepare('INSERT INTO archive_owner VALUES (?, ?, ?, ?, ?, ?, ?)');
  const session = db.prepare(`INSERT INTO archive_session
    (session_id, owner_id, room_id, title, started_at, ended_at, status, quality, event_count, favorite_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const event = db.prepare(`INSERT INTO archive_event
    (event_key, session_id, room_id, ordinal, event_ts, primary_category, user_uid, user_name, search_text, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const index = db.prepare('INSERT INTO archive_search_index VALUES (?, ?, ?)');
  const favorite = db.prepare('INSERT INTO archive_favorite VALUES (?, ?, ?, ?)');
  const eventTag = db.prepare('INSERT INTO archive_favorite_event_tag VALUES (?, ?)');
  db.exec(`INSERT INTO archive_favorite_tag VALUES (1, '重点', ${epoch}, ${epoch}), (2, '回顾', ${epoch}, ${epoch})`);
  for (let o = 0; o < 12; o++) {
    owner.run(`owner-${o}`, o + 1, `uid-${o}`, `主播${o}`, null, epoch, epoch + o);
    for (let s = 0; s < 2; s++) {
      const sessionId = `session-${o}-${s}`;
      session.run(sessionId, `owner-${o}`, o + 1, `固定场次${s}`, epoch, epoch + 600000, 'ended', 'complete', 500, 10, epoch, epoch);
      for (let i = 0; i < 500; i++) {
        const key = `${sessionId}:${String(i).padStart(4, '0')}`;
        const payload = {
          id: `raw-${i % 50}`, dedupe: key, roomId: o + 1, ts: epoch + i * 1000,
          msgType: i % 5 === 2 ? 1 : 0,
          text: `固定正文${i % 10}`,
          user: { uid: `user-${i % 10}`, uname: `用户${i % 10}`, guardLevel: 0 },
          ...(i % 5 === 1 ? { replyTo: { uname: '回复目标' } } : {}),
          ...(i % 5 === 2 ? { gift: { id: 1, name: '固定礼物', blindGiftName: '固定盲盒', count: 1, priceRmb: 1, paymentRmb: 1, coinType: 'gold' } } : {}),
        };
        const content = i % 5 === 2 ? '固定礼物 固定盲盒' : payload.text;
        event.run(key, sessionId, o + 1, i, payload.ts, payload.msgType === 1 ? 'gift' : 'danmu', payload.user.uid, payload.user.uname, content, JSON.stringify(payload));
        index.run(key, sessionId, content);
        if (i % 50 === 0) {
          favorite.run(key, sessionId, epoch + i, `普通备注${i}`);
          eventTag.run(key, 1);
        }
      }
    }
  }
  const historical = db.prepare('INSERT INTO archive_historical_favorite VALUES (?, ?, ?, ?, ?, ?, ?)');
  const historicalTag = db.prepare('INSERT INTO archive_historical_favorite_tag VALUES (?, ?)');
  for (let i = 0; i < 205; i++) {
    const key = `legacy-${String(i).padStart(4, '0')}`;
    historical.run(key, 1, `old-${i}`, JSON.stringify({ id: `old-${i}`, roomId: 1, ts: epoch + i, msgType: 0, text: '固定历史正文', replyTo: { uname: '回复目标' }, user: { uid: 'history', uname: '历史用户', guardLevel: 0 } }), epoch + i, '历史收藏', `历史备注${i}`);
    historicalTag.run(key, 2);
  }
  db.exec('COMMIT');
  db.close();
}

export function protectedSnapshot(db) {
  return Object.fromEntries([
    ['owners', 'SELECT * FROM archive_owner ORDER BY owner_id'],
    ['sessions', 'SELECT * FROM archive_session ORDER BY session_id'],
    ['events', 'SELECT event_key, session_id, room_id, ordinal, event_ts, primary_category, payload_json FROM archive_event ORDER BY event_key'],
    ['favorites', 'SELECT * FROM archive_favorite ORDER BY event_key'],
    ['historicalFavorites', 'SELECT legacy_key, room_id, event_id, event_json, favorited_at, label, note FROM archive_historical_favorite ORDER BY legacy_key'],
    ['tags', 'SELECT * FROM archive_favorite_tag ORDER BY tag_id'],
    ['eventTags', 'SELECT * FROM archive_favorite_event_tag ORDER BY event_key, tag_id'],
    ['historicalTags', 'SELECT * FROM archive_historical_favorite_tag ORDER BY legacy_key, tag_id'],
  ].map(([name, sql]) => [name, db.prepare(sql).all()]));
}

export async function inspectAcceptanceCopy(path, { ArchiveRepository, initializeArchiveDatabase }) {
  const db = new DatabaseSync(path);
  try {
    const database = sqliteAdapter(db);
    const before = protectedSnapshot(db);
    await initializeArchiveDatabase(database);
    assert.deepEqual(protectedSnapshot(db), before);
    const upgrade = { reads: database.reads.map(({ rows }) => rows), changedRows: database.writes.filter(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql.trim())).reduce((sum, { changes }) => sum + changes, 0) };
    database.reset();
    await initializeArchiveDatabase(database);
    assert.equal(database.writes.filter(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql.trim())).reduce((sum, { changes }) => sum + changes, 0), 0);
    const repository = new ArchiveRepository(database);
    const queries = {
      owners: () => repository.listOwners({ limit: 10 }),
      timeline: () => repository.queryEvents({ sessionId: 'session-0-0', limit: 100, direction: 'desc', includeTotal: true }),
      filtered: () => repository.queryEvents({ ownerId: 'owner-0', limit: 50, direction: 'desc', includeTotal: true, filters: { keywordConditions: [{ field: 'user', value: '用户3' }] } }),
      favorites: () => repository.queryFavorites({ limit: 50, includeTotal: true }),
    };
    const measurements = {};
    for (const [name, query] of Object.entries(queries)) {
      const samples = [];
      for (let i = 0; i < 8; i++) {
        database.reset();
        const start = performance.now();
        const result = await query();
        const ms = performance.now() - start;
        assert.equal(database.writes.length, 0);
        samples.push({ ms, queries: database.reads.length, rows: database.reads.map(({ rows }) => rows), items: Array.isArray(result) ? result.length : result.items.length, total: result.totalCount ?? null });
      }
      const expected = { owners: [1, [10], 10, null], timeline: [2, [101, 1], 100, 500], filtered: [2, [51, 1], 50, 100], favorites: [2, [51, 1], 50, 445] }[name];
      for (const sample of samples) assert.deepEqual([sample.queries, sample.rows, sample.items, sample.total], expected);
      measurements[name] = { first: samples[0], repeated: samples.slice(1), medianMs: samples.slice(1).map(({ ms }) => ms).sort((a, b) => a - b)[3] };
    }
    database.reset();
    const firstPage = await queries.timeline();
    const next = await repository.queryEvents({ sessionId: 'session-0-0', cursor: firstPage.nextCursor, limit: 100, direction: 'desc', includeTotal: true });
    assert.equal(next.items.length, 100);
    assert.equal(next.totalCount, null);
    assert.deepEqual(database.reads.map(({ rows }) => rows), [101, 1, 101]);
    assert.equal(new Set([...firstPage.items, ...next.items].map(({ eventKey }) => eventKey)).size, 200);
    database.reset();
    const favoritePage = await queries.favorites();
    const favoriteNext = await repository.queryFavorites({ cursor: favoritePage.nextCursor, limit: 50, includeTotal: true });
    assert.equal(favoriteNext.totalCount, null);
    assert.deepEqual(database.reads.map(({ rows }) => rows), [51, 1, 51]);
    assert.equal(new Set([...favoritePage.items, ...favoriteNext.items].map(({ sourceKind, stableId }) => `${sourceKind}:${stableId}`)).size, 100);
    assert.deepEqual(protectedSnapshot(db), before);
    const protection = Object.fromEntries(Object.entries(before).map(([name, rows]) => [name, rows.length]));
    database.reset();
    const append = Array.from({ length: 100 }, (_, i) => ({ eventKey: `appended-${i}`, sessionId: 'session-0-0', roomId: 1, ordinal: 500 + i, eventTs: epoch + 700000 + i, primaryCategory: 'danmu', searchText: '新增固定正文', payload: { id: `appended-${i}`, roomId: 1, ts: epoch + 700000 + i, msgType: 0, text: '新增固定正文' } }));
    assert.equal(await repository.appendEvents(append), 100);
    const appendWrites = database.writes.length;
    assert.equal(appendWrites, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archive_event').get().n, 12100);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archive_search_index').get().n, 12100);
    return { protection, upgrade, measurements, pagination: { timeline: { queries: 3, rows: [101, 1, 101], unique: 200 }, favorites: { queries: 3, rows: [51, 1, 51], unique: 100 } }, append: { events: 100, sqlWrites: appendWrites, rawRows: 100, indexRows: 100, sessionUpdates: 1 }, repeatedInitializationChangedRows: 0 };
  } finally { db.close(); }
}
