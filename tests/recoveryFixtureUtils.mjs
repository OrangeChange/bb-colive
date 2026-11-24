import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
export const fixtureRoot = new URL('./fixtures/cloudRecovery/v02/', import.meta.url);
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const fixtureBytes = (mode, path) => new Uint8Array(readFileSync(new URL(`${mode}/${path}`, fixtureRoot)));
const fullSelection = { scope: 'all', include_danmaku: true, include_interactions: true };
export const goldenRoot = mode => {
  const root = JSON.parse(new TextDecoder().decode(fixtureBytes(mode, 'root.json')));
  root.contract_version = '0.3'; root.selection = structuredClone(fullSelection);
  root.cut.selection = structuredClone(fullSelection);
  if (root.from_cut) root.from_cut.selection = structuredClone(fullSelection);
  return root;
};
export const goldenRootBytes = mode => new TextEncoder().encode(JSON.stringify(goldenRoot(mode)) + '\n');
export function goldenFetch(mode) { return async ref => fixtureBytes(mode, `objects/${ref.object_id}.data`); }
// Real disk-index contract without the desktop IPC dependency; SQL uniqueness
// and ordered bounded reads are exercised rather than an in-memory visited map.
export class SqliteCatalogIndex {
  db = new DatabaseSync(':memory:');
  constructor() { this.db.exec('CREATE TABLE descriptor(id TEXT PRIMARY KEY,kind TEXT,stream TEXT,ordinal INTEGER,json TEXT); CREATE TABLE snapshot(id TEXT PRIMARY KEY,json TEXT);'); }
  async register(ref) { this.db.prepare('INSERT INTO descriptor VALUES(?,?,?,?,?)').run(ref.object_id,ref.kind,ref.stream_id??null,ref.stream_ordinal??null,JSON.stringify(ref)); }
  async addSnapshot(ref) { this.db.prepare('INSERT INTO snapshot VALUES(?,?)').run(ref.snapshot_id,JSON.stringify(ref)); }
  async object(id) { const r=this.db.prepare('SELECT json FROM descriptor WHERE id=?').get(id);return r?JSON.parse(r.json):null; }
  async *objects() { let after=0;for(;;){const rows=this.db.prepare('SELECT json FROM descriptor WHERE kind NOT IN (?,?) ORDER BY stream,ordinal LIMIT 64 OFFSET ?').all('catalog_index','catalog_leaf',after);if(!rows.length)return;for(const r of rows)yield JSON.parse(r.json);after+=rows.length;} }
  async *snapshots() { let after='';for(;;){const rows=this.db.prepare('SELECT id,json FROM snapshot WHERE id>? ORDER BY id LIMIT 64').all(after);if(!rows.length)return;for(const r of rows){after=r.id;yield JSON.parse(r.json);} } }
  close() { this.db.close(); }
}

