import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHIVE_SCHEMA_STATEMENTS, initializeArchiveDatabase } from '../src/archive/archiveSchema.ts';
import { ArchiveRepository } from '../src/archive/archiveRepository.ts';
import { createAcceptanceFixture, inspectAcceptanceCopy } from './helpers/archiveAcceptance.mjs';

test('固定 SQLite 档案升级和分页保留原始归属与收藏整理，读取有界且每条新增仅写一份', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'danmu-task-8-acceptance-'));
  const path = join(directory, 'fixture.sqlite');
  createAcceptanceFixture(path, ARCHIVE_SCHEMA_STATEMENTS);
  const result = await inspectAcceptanceCopy(path, { ArchiveRepository, initializeArchiveDatabase });
  console.log('SQLite acceptance', JSON.stringify({ directory, ...result }));
});
