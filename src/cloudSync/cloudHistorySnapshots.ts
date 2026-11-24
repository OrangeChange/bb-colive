import type { GiftIconInfo } from '../protocol/gifts.ts';
import { profileFromAchievementLevel } from '../protocol/roomGuardProfile.ts';
import type { HistoryContext, HistoryEnvelope, HistorySnapshot, HistorySnapshotEvidence,
  HistorySnapshotKind, HistorySnapshotProjection } from './cloudHistoryTypes.ts';

const kinds: HistorySnapshotKind[] = ['room_info', 'gift_config', 'gift_effect_config'];
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function identity(value: unknown): string | undefined {
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
}
function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
export function sameHistorySnapshotValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, i) => sameHistorySnapshotValue(value, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameHistorySnapshotValue(left[key], right[key]));
}

export function indexHistorySnapshots(snapshots: readonly HistorySnapshot[]): Map<string, HistorySnapshot> {
  const index = new Map<string, HistorySnapshot>();
  for (const snapshot of snapshots) {
    const old = index.get(snapshot.snapshot_id);
    if (old && !sameHistorySnapshotValue(old, snapshot)) throw new Error('关联配置内容冲突，请重新读取该同步范围');
    index.set(snapshot.snapshot_id, snapshot);
  }
  return index;
}

function project(snapshot: Extract<HistorySnapshot, { availability: 'available' }>, kind: HistorySnapshotKind,
  roomId: string): HistorySnapshotProjection {
  const projection: HistorySnapshotProjection = { snapshotId: snapshot.snapshot_id, kind, fetchedAt: snapshot.fetched_at };
  const data = object(snapshot.raw_data);
  if (kind === 'room_info') {
    const room = object(data.room_info);
    if (identity(room.room_id) !== roomId) return projection;
    projection.anchorUid = identity(room.uid);
    const guard = object(data.guard_info);
    projection.roomGuardProfile = profileFromAchievementLevel(numeric(guard.anchor_guard_achieve_level), 'room-info', numeric(guard.count));
  } else if (kind === 'gift_config') {
    const gifts = new Map<number, GiftIconInfo>();
    for (const item of Array.isArray(data.list) ? data.list : []) {
      const g = object(item), id = numeric(g.id);
      if (id === undefined || !Number.isSafeInteger(id) || id <= 0) continue;
      gifts.set(id, { icon: text(g.img_basic), webp: text(g.webp), gif: text(g.gif), effect: numeric(g.effect),
        effectId: numeric(g.effect_id), hasImagedGift: numeric(g.has_imaged_gift) });
    }
    projection.gifts = gifts;
  }
  return projection;
}

export function applyHistorySnapshots(candidate: HistoryContext, item: HistoryEnvelope,
  snapshots: readonly HistorySnapshot[]): HistorySnapshotEvidence[] {
  const index = indexHistorySnapshots(snapshots);
  const previous = candidate.projections;
  const next: HistoryContext['projections'] = {};
  const selected = new Map<HistorySnapshotKind, string>();
  const evidence: HistorySnapshotEvidence[] = [];
  for (const snapshotId of item.snapshot_ids) {
    const snapshot = index.get(snapshotId);
    const retained = kinds.map(kind => previous[kind]).find(p => p?.snapshotId === snapshotId);
    const kind = snapshot?.availability === 'available' ? snapshot.kind : retained?.kind ?? null;
    const known = kinds.includes(kind as HistorySnapshotKind) ? kind as HistorySnapshotKind : undefined;
    if (known) {
      const oldId = selected.get(known);
      if (oldId && oldId !== snapshotId) throw new Error('同一条记录关联了冲突配置，请重新读取该同步范围');
      selected.set(known, snapshotId);
    }
    const reuse = snapshot?.availability === 'expired' && !!retained;
    evidence.push({ snapshotId, kind, availability: snapshot?.availability ?? 'missing',
      result: snapshot?.availability === 'available' ? snapshot.result : null, retainedProjection: reuse });
    if (known && snapshot?.availability === 'available' && snapshot.result === 'success') {
      next[known] = project(snapshot, known, candidate.source.roomId);
    } else if (known && reuse) next[known] = retained;
  }
  candidate.projections = next;
  candidate.adapter.anchorUid = next.room_info?.anchorUid ?? '';
  candidate.adapter.roomGuardProfile = next.room_info?.roomGuardProfile && { ...next.room_info.roomGuardProfile };
  return evidence;
}

export function getHistoryGiftIcon(context: HistoryContext, giftId: number): GiftIconInfo | undefined {
  return context.projections.gift_config?.gifts?.get(giftId);
}
