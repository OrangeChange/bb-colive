import type { DanmakuUser, RoomGuardProfile } from '../protocol/types.ts';
import type { GiftIconInfo } from '../protocol/gifts.ts';
import type { HistoryContext, HistorySourceIdentity, HistorySnapshotKind, HistorySnapshotProjection } from './cloudHistoryTypes.ts';
import { validateCloudCursor, validateCloudRoomId } from './cloudSyncCursor.ts';

export const HISTORY_PARSER_VERSION = 'bb-history-adapter/1' as const;
const kinds: HistorySnapshotKind[] = ['room_info', 'gift_config', 'gift_effect_config'];
type Wealth = Pick<DanmakuUser, 'wealthLevel' | 'wealthIconKey' | 'wealthIconUrl'>;
type ObjectValue = Record<string, unknown>;

function invalid(): never { throw new Error('历史解析进度无法恢复，请重新读取该同步范围'); }
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as ObjectValue;
}
function string(value: unknown): string { if (typeof value !== 'string') invalid(); return value; }
function nullableString(value: unknown): string | null { return value === null ? null : string(value); }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) invalid(); return value; }
function optionalString(value: unknown): string | undefined { return value === undefined ? undefined : string(value); }
function optionalNumber(value: unknown): number | undefined { return value === undefined ? undefined : number(value); }
function wealth(value: unknown): Wealth {
  const v = object(value);
  return { wealthLevel: optionalNumber(v.wealthLevel), wealthIconKey: optionalString(v.wealthIconKey), wealthIconUrl: optionalString(v.wealthIconUrl) };
}
function gift(value: unknown): GiftIconInfo {
  const v = object(value);
  return { icon: optionalString(v.icon), webp: optionalString(v.webp), gif: optionalString(v.gif),
    effect: optionalNumber(v.effect), effectId: optionalNumber(v.effectId), hasImagedGift: optionalNumber(v.hasImagedGift) };
}
function profile(value: unknown): RoomGuardProfile | undefined {
  if (value === undefined) return undefined;
  const v = object(value);
  if (!['unknown', 'standard', 'thousand', 'tenThousand'].includes(string(v.milestone))
    || !['base', 'enhanced'].includes(string(v.iconSet))) invalid();
  const source = string(v.source);
  if (!['unknown', 'room-info', 'guard-ranking', 'achievement-event'].includes(source)) invalid();
  return { roomId: optionalNumber(v.roomId), anchorUid: optionalString(v.anchorUid),
    anchorGuardAchieveLevel: optionalNumber(v.anchorGuardAchieveLevel), guardCount: optionalNumber(v.guardCount),
    milestone: v.milestone as RoomGuardProfile['milestone'], iconSet: v.iconSet as RoomGuardProfile['iconSet'],
    source: source as RoomGuardProfile['source'] };
}
function entries<K extends string | number, V>(value: unknown, key: (v: unknown) => K, item: (v: unknown) => V): Map<K, V> {
  if (!Array.isArray(value)) invalid();
  const result = new Map<K, V>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) invalid();
    const k = key(entry[0]);
    if (result.has(k)) invalid();
    result.set(k, item(entry[1]));
  }
  return result;
}
function numericKey(value: unknown): number {
  const key = number(value);
  if (!Number.isSafeInteger(key) || key < 0) invalid();
  return key;
}
function sorted<K extends string | number, V>(map: Map<K, V> | undefined, item: (v: V) => unknown = v => v) {
  return [...(map ?? new Map<K, V>())].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, item(v)]);
}

export function createHistoryContext(source: HistorySourceIdentity, after = '0'): HistoryContext {
  validateCloudRoomId(source.roomId);
  validateCloudCursor(after);
  if (!source.serverId || !Number.isSafeInteger(Number(source.roomId))) invalid();
  return { formatVersion: 1, parserVersion: HISTORY_PARSER_VERSION,
    source: { serverId: source.serverId, roomId: source.roomId }, lastSequence: after,
    connectionId: null, loginAccountUid: null, projections: {},
    adapter: { roomId: Number(source.roomId), anchorUid: '', keepRaw: false,
      wealthByUid: new Map(), avatarsByUid: new Map(), guardIconUrlsByUid: new Map(), wealthIconUrlsByLevel: new Map() } };
}

export function cloneHistoryContext(context: HistoryContext): HistoryContext {
  const a = context.adapter;
  const projections: HistoryContext['projections'] = {};
  for (const kind of kinds) {
    const p = context.projections[kind];
    if (p) projections[kind] = { ...p, roomGuardProfile: p.roomGuardProfile && { ...p.roomGuardProfile },
      gifts: p.gifts && new Map([...p.gifts].map(([id, value]) => [id, { ...value }])) };
  }
  return { ...context, source: { ...context.source }, projections,
    adapter: { ...a, roomGuardProfile: a.roomGuardProfile && { ...a.roomGuardProfile },
      wealthByUid: new Map([...a.wealthByUid ?? []].map(([uid, value]) => [uid, { ...value }])),
      avatarsByUid: new Map(a.avatarsByUid), guardIconUrlsByUid: new Map(a.guardIconUrlsByUid),
      wealthIconUrlsByLevel: new Map(a.wealthIconUrlsByLevel) } };
}

export function advanceHistoryConnection(context: HistoryContext, connectionId: string, loginAccountUid: string): HistoryContext {
  const next = context.connectionId === connectionId && context.loginAccountUid === loginAccountUid
    ? cloneHistoryContext(context) : createHistoryContext(context.source, context.lastSequence);
  next.connectionId = connectionId;
  next.loginAccountUid = loginAccountUid;
  return next;
}

export function encodeHistoryContext(context: HistoryContext): string {
  const a = context.adapter;
  const projections: ObjectValue = {};
  for (const kind of kinds) {
    const p = context.projections[kind];
    if (p) projections[kind] = { snapshotId: p.snapshotId, kind: p.kind, fetchedAt: p.fetchedAt,
      anchorUid: p.anchorUid, roomGuardProfile: profile(p.roomGuardProfile), gifts: p.gifts && sorted(p.gifts, gift) };
  }
  return JSON.stringify({ formatVersion: context.formatVersion, parserVersion: context.parserVersion,
    source: { serverId: context.source.serverId, roomId: context.source.roomId }, lastSequence: context.lastSequence,
    connectionId: context.connectionId, loginAccountUid: context.loginAccountUid,
    adapter: { roomId: a.roomId, anchorUid: a.anchorUid, keepRaw: false, roomGuardProfile: profile(a.roomGuardProfile),
      wealthByUid: sorted(a.wealthByUid, wealth), avatarsByUid: sorted(a.avatarsByUid),
      guardIconUrlsByUid: sorted(a.guardIconUrlsByUid), wealthIconUrlsByLevel: sorted(a.wealthIconUrlsByLevel) }, projections });
}

export function decodeHistoryContext(json: string, expected: HistorySourceIdentity): HistoryContext {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { invalid(); }
  const v = object(parsed), source = object(v.source);
  if (v.formatVersion !== 1 || v.parserVersion !== HISTORY_PARSER_VERSION
    || source.serverId !== expected.serverId || source.roomId !== expected.roomId) invalid();
  const context = createHistoryContext(expected, string(v.lastSequence));
  context.connectionId = nullableString(v.connectionId);
  context.loginAccountUid = nullableString(v.loginAccountUid);
  const a = object(v.adapter);
  if (a.roomId !== context.adapter.roomId || a.keepRaw !== false) invalid();
  context.adapter = { roomId: context.adapter.roomId, anchorUid: string(a.anchorUid), keepRaw: false,
    roomGuardProfile: profile(a.roomGuardProfile), wealthByUid: entries(a.wealthByUid, string, wealth),
    avatarsByUid: entries(a.avatarsByUid, string, string), guardIconUrlsByUid: entries(a.guardIconUrlsByUid, string, string),
    wealthIconUrlsByLevel: entries(a.wealthIconUrlsByLevel, numericKey, string) };
  const projections = object(v.projections);
  for (const kind of kinds) {
    if (projections[kind] === undefined) continue;
    const p = object(projections[kind]);
    if (p.kind !== kind || !Number.isFinite(Date.parse(string(p.fetchedAt)))) invalid();
    const projection: HistorySnapshotProjection = { snapshotId: string(p.snapshotId), kind, fetchedAt: string(p.fetchedAt),
      anchorUid: optionalString(p.anchorUid), roomGuardProfile: profile(p.roomGuardProfile),
      gifts: p.gifts === undefined ? undefined : entries(p.gifts, numericKey, gift) };
    context.projections[kind] = projection;
  }
  return context;
}
