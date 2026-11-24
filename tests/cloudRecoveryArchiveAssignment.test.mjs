import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteAdapter } from './helpers/archiveAcceptance.mjs';
import { ArchiveRepository } from '../src/archive/archiveRepository.ts';

test('云端事件归属修订同步移动事件、收藏和搜索索引', async t => {
  const path = join(mkdtempSync(join(tmpdir(), 'danmu-cloud-assignment-')), 'archive.sqlite');
  const db = new DatabaseSync(path); t.after(() => db.close());
  const repository = new ArchiveRepository(sqliteAdapter(db));
  await repository.initialize();
  await repository.upsertOwner({ ownerId: 'owner', roomId: 123, createdAt: 1, updatedAt: 1 });
  for (const sessionId of ['one', 'two']) await repository.upsertSession({ sessionId, ownerId: 'owner', roomId: 123,
    startedAt: 1, status: 'ended', quality: 'complete', recordingStatus: 'stopped', createdAt: 1, updatedAt: 1 });
  const key = sequence => JSON.stringify(['cloud-event', 'server', '123', String(sequence), 0]);
  await repository.appendEvents([1, 2].map((sequence, ordinal) => ({ eventKey: key(sequence), sessionId: 'one', roomId: 123,
    ordinal, eventTs: sequence, primaryCategory: 'danmu', searchText: `event-${sequence}`,
    payload: { id: `event-${sequence}`, roomId: 123, ts: sequence, msgType: 0, text: `event-${sequence}` } })));
  await repository.setFavorite(key(2), true, 3);
  assert.equal(await repository.reassignSourceEventRange({ namespace: 'cloud-event', serverId: 'server', roomId: '123',
    fromSequence: '2', throughSequence: '2', targetSessionId: 'two' }), 1);
  assert.equal((await repository.getEvent(key(2))).sessionId, 'two');
  assert.equal(db.prepare('SELECT session_id FROM archive_favorite WHERE event_key = ?').get(key(2)).session_id, 'two');
  assert.equal(db.prepare('SELECT session_id FROM archive_search_index WHERE event_key = ?').get(key(2)).session_id, 'two');
  assert.equal(db.prepare('SELECT favorite_count FROM archive_session WHERE session_id = ?').get('one').favorite_count, 0);
  assert.equal(db.prepare('SELECT favorite_count FROM archive_session WHERE session_id = ?').get('two').favorite_count, 1);
  assert.equal(await repository.reassignSourceEventRange({ namespace: 'cloud-event', serverId: 'server', roomId: '123',
    fromSequence: '1', throughSequence: '2', targetSessionId: null }), 0);
  assert.equal((await repository.getEvent(key(1))).sessionId, 'one');
  assert.equal((await repository.getEvent(key(2))).sessionId, 'two');
});
