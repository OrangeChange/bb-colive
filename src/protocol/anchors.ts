/**
 * 主播列表持久化（tauri-plugin-store，文件 anchors.local.json，已被 .gitignore 排除）
 *
 * 交互语义：连接即添加（最近连接历史，非显式收藏）。按真实房间号去重，
 * 按最近连接排序，保留全部未主动移除的主播。
 */
import { invoke } from '@tauri-apps/api/core'
import { load, type Store } from '../appData.ts'

const ANCHORS_STORE_FILE = 'anchors.local.json' // .gitignore: *.local.json
const ANCHORS_KEY = 'anchors'

export interface Anchor {
  /** 用户输入原样（短号或真实房间号，重连时用） */
  roomIdInput: string
  /** 真实房间号（去重键） */
  realRoomId: number
  uname: string
  face?: string
  /** 开播状态快照（0 未开播 1 开播中 2 轮播）：启动与定时刷新 + 当前房间 LIVE 事件实时更新 */
  liveStatus?: 0 | 1 | 2
  /** 最近一次连接时间（ms），排序用 */
  lastConnectedAt: number
}

/** 从主播历史中选择最近连接的主播；时间相同则保留列表中更靠前的记录。 */
export function getMostRecentAnchor<T extends Pick<Anchor, "lastConnectedAt">>(
  anchors: readonly T[],
): T | null {
  return anchors.reduce<T | null>(
    (latest, anchor) => !latest || anchor.lastConnectedAt > latest.lastConnectedAt ? anchor : latest,
    null,
  )
}

async function openStore(): Promise<Store> {
  return load(ANCHORS_STORE_FILE, { autoSave: false })
}

export async function loadAnchors(): Promise<Anchor[]> {
  return invoke<Anchor[]>('read_anchor_list')
}

/** 列表修改顺序保存，状态刷新只更新当前列表中的记录。 */
let pendingWrite: Promise<unknown> = Promise.resolve();
function updateAnchors(change: (current: Anchor[]) => Anchor[]): Promise<Anchor[]> {
  const next = pendingWrite.then(async () => {
    const current = await loadAnchors();
    const result = change(current);
    if (result === current) return current;
    const store = await openStore();
    await store.set(ANCHORS_KEY, result);
    await store.save();
    return result;
  });
  pendingWrite = next.catch(() => {});
  return next;
}

/** 连接成功后更新资料，并按最近连接排序。 */
export function upsertAnchor(anchor: Anchor): Promise<Anchor[]> {
  return updateAnchors(current => [anchor, ...current.filter(item => item.realRoomId !== anchor.realRoomId)]);
}

export function removeAnchor(realRoomId: number): Promise<Anchor[]> {
  return updateAnchors(current => current.filter(item => item.realRoomId !== realRoomId));
}

export function updateAnchorStatuses(statuses: ReadonlyArray<Pick<Anchor, "realRoomId" | "liveStatus">>): Promise<Anchor[]> {
  const byRoom = new Map(statuses.map(item => [item.realRoomId, item.liveStatus]));
  return updateAnchors(current => {
    let changed = false;
    const next = current.map(item => {
      const liveStatus = byRoom.get(item.realRoomId);
      if (liveStatus === undefined || liveStatus === item.liveStatus) return item;
      changed = true;
      return {...item, liveStatus};
    });
    return changed ? next : current;
  });
}

/** 显式保存完整列表，保持传入顺序。 */
export function saveAnchors(list: Anchor[]): Promise<Anchor[]> {
  return updateAnchors(() => list);
}
