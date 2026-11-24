import type { ArchiveDatabase } from "./archiveTypes.ts";
import { buildArchiveContentTextFromPayload } from "./archiveContentSearch.ts";
import { ARCHIVE_LEGACY_GAP_REASONS, ARCHIVE_LEGACY_STOP_REASONS, ARCHIVE_LEGACY_LATE_START_SQL } from './archiveSessionState.ts';

export const ARCHIVE_SCHEMA_VERSION = 9;

export const ARCHIVE_SCHEMA_STATEMENTS = [
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS archive_owner (
    owner_id TEXT PRIMARY KEY,
    room_id INTEGER NOT NULL UNIQUE,
    owner_uid TEXT,
    owner_name TEXT,
    owner_avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS archive_source (
    source_id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    coverage_start INTEGER,
    coverage_end INTEGER,
    completed_count INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS archive_session (
    session_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    title TEXT,
    cover_url TEXT,
    cloud_metadata TEXT,
    latest_title TEXT,
    title_source TEXT NOT NULL DEFAULT 'time',
    live_key TEXT,
    sub_session_key TEXT,
    source_live_started_at INTEGER,
    identity_evidence TEXT NOT NULL DEFAULT 'unavailable',
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('active', 'ended', 'unclean')),
    quality TEXT NOT NULL CHECK (quality IN ('in-progress', 'complete', 'incomplete')),
    quality_reason TEXT,
    recording_status TEXT NOT NULL DEFAULT 'stopped' CHECK (recording_status IN ('recording', 'reconnecting', 'stopped')),
    stop_reason TEXT,
    quality_reasons TEXT NOT NULL DEFAULT '[]',
    event_count INTEGER NOT NULL DEFAULT 0,
    paid_total REAL NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (session_id, room_id),
    FOREIGN KEY (owner_id) REFERENCES archive_owner(owner_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_event (
    event_key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    event_ts INTEGER NOT NULL,
    primary_category TEXT NOT NULL,
    secondary_category TEXT,
    user_uid TEXT,
    user_name TEXT,
    search_text TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL,
    source_id TEXT,
    UNIQUE (session_id, ordinal),
    FOREIGN KEY (session_id) REFERENCES archive_session(session_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_user_profile (
    user_uid TEXT PRIMARY KEY,
    nickname TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS archive_event_source (
    event_key TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (event_key, source_id),
    FOREIGN KEY (event_key) REFERENCES archive_event(event_key) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES archive_source(source_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_favorite (
    event_key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    favorited_at INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    UNIQUE (session_id, event_key),
    FOREIGN KEY (event_key) REFERENCES archive_event(event_key) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES archive_session(session_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_historical_favorite (
    legacy_key TEXT PRIMARY KEY,
    room_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    event_json TEXT NOT NULL,
    favorited_at INTEGER NOT NULL,
    label TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS archive_favorite_tag (
    tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS archive_favorite_event_tag (
    event_key TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (event_key, tag_id),
    FOREIGN KEY (event_key) REFERENCES archive_event(event_key) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES archive_favorite_tag(tag_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_historical_favorite_tag (
    legacy_key TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (legacy_key, tag_id),
    FOREIGN KEY (legacy_key) REFERENCES archive_historical_favorite(legacy_key) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES archive_favorite_tag(tag_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS archive_reading_state (
    session_id TEXT PRIMARY KEY,
    event_key TEXT,
    fallback_event_ts INTEGER,
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('asc', 'desc')),
    filters_json TEXT NOT NULL DEFAULT '{}',
    search_scope TEXT NOT NULL CHECK (search_scope IN ('session', 'owner', 'all')),
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES archive_session(session_id) ON DELETE CASCADE,
    FOREIGN KEY (event_key) REFERENCES archive_event(event_key) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS archive_search_index (
    event_key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    search_text TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (event_key) REFERENCES archive_event(event_key) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES archive_session(session_id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_archive_session_room_started_at ON archive_session (room_id, started_at)",
  "CREATE INDEX IF NOT EXISTS idx_archive_session_live_identity ON archive_session (room_id, source_live_started_at, status, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_archive_event_session_time ON archive_event (session_id, event_ts, ordinal)",
  "CREATE INDEX IF NOT EXISTS idx_archive_event_session_category_time ON archive_event (session_id, primary_category, event_ts)",
  "CREATE INDEX IF NOT EXISTS idx_archive_event_user_time ON archive_event (user_uid, event_ts)",
  "CREATE INDEX IF NOT EXISTS idx_archive_favorite_session_time ON archive_favorite (session_id, favorited_at)",
  "CREATE INDEX IF NOT EXISTS idx_archive_favorite_event ON archive_favorite (event_key)",
  "CREATE INDEX IF NOT EXISTS idx_archive_historical_favorite_time ON archive_historical_favorite (favorited_at)",
  "CREATE INDEX IF NOT EXISTS idx_archive_favorite_event_tag_tag ON archive_favorite_event_tag (tag_id, event_key)",
  "CREATE INDEX IF NOT EXISTS idx_archive_historical_favorite_tag_tag ON archive_historical_favorite_tag (tag_id, legacy_key)",
  "CREATE INDEX IF NOT EXISTS idx_archive_search_session ON archive_search_index (session_id)",
  "PRAGMA user_version = 9",
] as const;

export const ARCHIVE_SCHEMA_SQL = ARCHIVE_SCHEMA_STATEMENTS.join(";\n");

async function backfillSearchText(database: ArchiveDatabase, currentVersion: number): Promise<void> {
  type EventSearchRow = {
    eventKey: string; sessionId: string; payloadJson: string; searchText: string; indexText: string | null;
  };
  type HistoricalSearchRow = { legacyKey: string; eventJson: string; searchText: string };
  const batchSize = 200;
  let eventKey: string | null = null;
  while (true) {
    const values: unknown[] = [currentVersion, batchSize];
    if (eventKey !== null) values.push(eventKey);
    const rows: EventSearchRow[] = await database.select<EventSearchRow[]>(`
      SELECT e.event_key AS eventKey, e.session_id AS sessionId, e.payload_json AS payloadJson,
        e.search_text AS searchText, i.search_text AS indexText
      FROM archive_event e LEFT JOIN archive_search_index i ON i.event_key = e.event_key
      WHERE ${eventKey === null ? "1" : "e.event_key > $3"}
        AND ($1 < 6 OR instr(e.search_text, '  ') > 0
          OR CASE WHEN json_valid(e.payload_json)
            THEN COALESCE(json_extract(e.payload_json, '$.replyTo.uname'), '') <> ''
            ELSE 0 END
          OR i.search_text IS NULL OR i.search_text <> e.search_text)
      ORDER BY e.event_key LIMIT $2
    `, values);
    if (rows.length === 0) break;
    for (const row of rows) {
      const content = buildArchiveContentTextFromPayload(row.payloadJson);
      if (row.searchText !== content) {
        await database.execute("UPDATE archive_event SET search_text = $1 WHERE event_key = $2", [content, row.eventKey]);
      }
      if (row.indexText !== content) {
        await database.execute(`
          INSERT INTO archive_search_index (event_key, session_id, search_text) VALUES ($1, $2, $3)
          ON CONFLICT(event_key) DO UPDATE SET search_text = excluded.search_text
        `, [row.eventKey, row.sessionId, content]);
      }
    }
    eventKey = rows[rows.length - 1].eventKey;
  }
  let legacyKey: string | null = null;
  while (true) {
    const values: unknown[] = [batchSize];
    if (legacyKey !== null) values.push(legacyKey);
    const rows: HistoricalSearchRow[] = await database.select<HistoricalSearchRow[]>(`
      SELECT legacy_key AS legacyKey, event_json AS eventJson, search_text AS searchText
      FROM archive_historical_favorite
      WHERE ${legacyKey === null ? "1" : "legacy_key > $2"} ORDER BY legacy_key LIMIT $1
    `, values);
    if (rows.length === 0) break;
    for (const row of rows) {
      const content = buildArchiveContentTextFromPayload(row.eventJson);
      if (row.searchText !== content) {
        await database.execute("UPDATE archive_historical_favorite SET search_text = $1 WHERE legacy_key = $2", [content, row.legacyKey]);
      }
    }
    legacyKey = rows[rows.length - 1].legacyKey;
  }
}

export async function initializeArchiveDatabase(database: ArchiveDatabase): Promise<void> {
  const versionRows = await database.select<Array<{ user_version?: unknown; userVersion?: unknown }>>(
    "PRAGMA user_version",
  );
  const currentVersion = Number(versionRows[0]?.user_version ?? versionRows[0]?.userVersion ?? 0);
  for (const statement of ARCHIVE_SCHEMA_STATEMENTS) {
    if (statement === "PRAGMA user_version = 9") continue;
    await database.execute(statement);
  }

  // 旧版已经存在 archive_session 时，CREATE TABLE IF NOT EXISTS 不会补列；
  // 只对缺少的字段做非破坏性迁移，再写入当前 schema 版本。
  const columns = await database.select<Array<{ name?: string }>>("PRAGMA table_info(archive_session)");
  const existing = new Set(columns.map((column) => column.name).filter((name): name is string => typeof name === "string"));
  const migrations: readonly [string, string][] = [
    ["latest_title", "ALTER TABLE archive_session ADD COLUMN latest_title TEXT"],
    ["cover_url", "ALTER TABLE archive_session ADD COLUMN cover_url TEXT"],
    ["cloud_metadata", "ALTER TABLE archive_session ADD COLUMN cloud_metadata TEXT"],
    ["title_source", "ALTER TABLE archive_session ADD COLUMN title_source TEXT NOT NULL DEFAULT 'time'"],
    ["live_key", "ALTER TABLE archive_session ADD COLUMN live_key TEXT"],
    ["sub_session_key", "ALTER TABLE archive_session ADD COLUMN sub_session_key TEXT"],
    ["source_live_started_at", "ALTER TABLE archive_session ADD COLUMN source_live_started_at INTEGER"],
    ["identity_evidence", "ALTER TABLE archive_session ADD COLUMN identity_evidence TEXT NOT NULL DEFAULT 'unavailable'"],
    ["recording_status", "ALTER TABLE archive_session ADD COLUMN recording_status TEXT NOT NULL DEFAULT 'stopped' CHECK (recording_status IN ('recording', 'reconnecting', 'stopped'))"],
    ["stop_reason", "ALTER TABLE archive_session ADD COLUMN stop_reason TEXT"],
    ["quality_reasons", "ALTER TABLE archive_session ADD COLUMN quality_reasons TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [name, sql] of migrations) {
    if (!existing.has(name)) await database.execute(sql);
  }
  const favoriteColumns = await database.select<Array<{ name?: string }>>("PRAGMA table_info(archive_favorite)");
  const historicalFavoriteColumns = await database.select<Array<{ name?: string }>>("PRAGMA table_info(archive_historical_favorite)");
  const favoriteColumnNames = new Set(favoriteColumns.map((column) => column.name).filter((name): name is string => typeof name === "string"));
  const historicalFavoriteColumnNames = new Set(historicalFavoriteColumns.map((column) => column.name).filter((name): name is string => typeof name === "string"));
  if (!favoriteColumnNames.has("note")) await database.execute("ALTER TABLE archive_favorite ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  if (!historicalFavoriteColumnNames.has("note")) await database.execute("ALTER TABLE archive_historical_favorite ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  if (!historicalFavoriteColumnNames.has("search_text")) {
    await database.execute("ALTER TABLE archive_historical_favorite ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
  }
  if (currentVersion < 7) await backfillSearchText(database, currentVersion);
  // 生命周期原本是独立一级分类；现统一归入系统，保留旧档案在系统筛选中的可见性。
  await database.execute("UPDATE archive_event SET primary_category = 'system' WHERE primary_category = 'lifecycle'");
  if (currentVersion < 8) {
    const gapReasons = ARCHIVE_LEGACY_GAP_REASONS.map(reason => `'${reason}'`).join(', ');
    const stopReasons = ARCHIVE_LEGACY_STOP_REASONS.map(reason => `'${reason}'`).join(', ');
    const lateStart = ARCHIVE_LEGACY_LATE_START_SQL;
    // 一次性解释旧原因；原始原因及时间、内容、统计保持原值。
    await database.execute(`UPDATE archive_session SET
      status = CASE WHEN status = 'active' THEN 'unclean' ELSE status END,
      recording_status = 'stopped',
      stop_reason = CASE WHEN quality_reason IN (${stopReasons}) THEN quality_reason ELSE NULL END,
      quality_reasons = CASE
        WHEN (${lateStart}) AND quality_reason IN (${gapReasons}) AND quality_reason <> 'live-start-not-captured'
          THEN json_array('live-start-not-captured', quality_reason)
        WHEN quality_reason IN (${gapReasons}) THEN json_array(quality_reason)
        WHEN ${lateStart} THEN json_array('live-start-not-captured') ELSE '[]' END,
      quality = CASE WHEN quality_reason IN (${gapReasons}) OR (${lateStart}) THEN 'incomplete'
        WHEN quality = 'incomplete' THEN 'in-progress' ELSE quality END`);
  }
  // 删除历史档案后不保留没有任何场次的主播主记录，避免空间统计和保留策略列表出现空主播。
  await database.execute(
    "DELETE FROM archive_owner WHERE NOT EXISTS (SELECT 1 FROM archive_session s WHERE s.owner_id = archive_owner.owner_id)",
  );
  await database.execute("CREATE INDEX IF NOT EXISTS idx_archive_session_live_key ON archive_session (room_id, live_key)");
  await database.execute("PRAGMA user_version = 9");
}
