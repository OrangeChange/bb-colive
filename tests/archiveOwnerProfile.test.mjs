import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sqliteAdapter } from './helpers/archiveAcceptance.mjs';
import { ArchiveRepository } from '../src/archive/archiveRepository.ts';
import { ARCHIVE_SCHEMA_STATEMENTS } from '../src/archive/archiveSchema.ts';

test('补主播资料仅填空字段，不覆盖已有资料或复活已删除档案', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of ARCHIVE_SCHEMA_STATEMENTS) db.exec(sql);
    db.exec("INSERT INTO archive_owner VALUES ('room:1',1,NULL,NULL,NULL,10,20)");
    const repository = new ArchiveRepository(sqliteAdapter(db));
    await repository.fillOwnerProfile({ ownerId: 'room:1', roomId: 1, uid: '9', name: '主播', avatarUrl: 'face', updatedAt: 30 });
    await repository.fillOwnerProfile({ ownerId: 'room:1', roomId: 1, uid: '8', name: '替换', avatarUrl: 'other', updatedAt: 40 });
    const row = db.prepare('SELECT * FROM archive_owner').get();
    assert.equal(row.owner_name, '主播');
    assert.equal(row.owner_avatar_url, 'face');
    assert.equal(row.owner_uid, '9');
    assert.equal(row.created_at, 10);
    db.exec('DELETE FROM archive_owner');
    await repository.fillOwnerProfile({ ownerId: 'room:1', roomId: 1, name: '主播' });
    assert.equal(db.prepare('SELECT count(*) AS n FROM archive_owner').get().n, 0);
  } finally { db.close(); }
});
