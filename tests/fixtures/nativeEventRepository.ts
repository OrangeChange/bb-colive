import type { ArchiveEventCursor, ArchiveEventQuery, ArchiveEventRecord, ArchiveRepositoryContract, ArchiveSessionSummary } from "../../src/archive/archiveTypes.ts";
import { projectArchiveEvents } from "../../src/archive/archiveProjection.ts";
import type { DanmakuEvent } from "../../src/protocol/types.ts";
import { getNativeEventSample, nativeEventSamples } from "./nativeEventSamples.ts";
import { createLotteryFixtureEvent } from './task2LotteryData.ts';

export const FIXTURE_OWNER = "fixture-owner";
export const FIXTURE_SESSION = "fixture-session-2";
export const FIXTURE_TARGET_A = `${FIXTURE_SESSION}:event:360`;
export const FIXTURE_TARGET_B = `${FIXTURE_SESSION}:event:361`;
const start = 1700000000000;
const rows = nativeEventSamples.filter(sample => sample.handling === "row");

export function createFixtureEvent(index: number, sessionId = FIXTURE_SESSION, lotteryScene: boolean | 'pocket' = false): DanmakuEvent {
  const key = index === 360 || index === 361 ? "text" : rows[index % rows.length].key;
  const lottery = lotteryScene ? createLotteryFixtureEvent(index, lotteryScene === 'pocket') : undefined;
  const event = lottery ?? getNativeEventSample(key);
  event.id = `${sessionId}:event:${index}`;
  event.reactKey = event.id;
  event.dedupe = event.id;
  event.comboId = event.gift ? event.id : undefined;
  event.ts = start + (sessionId === FIXTURE_SESSION ? 10000000 : 0) + Math.floor(index / 2) * 1000;
  const target = index === 360 || index === 361;
  if (event.user && !lottery) event.user = { ...event.user, uid: target ? "fixture-same-user" : `fixture-user-${index}`, uname: target ? "目标用户" : `观众${index}`, avatar: "/wealth-levels/1.png" };
  if (target && !lottery) event.text = index === 360 ? "目标A 完整弹幕" : "目标B 完整弹幕";
  if (event.gift) { event.gift.webp = "/wealth-levels/1.png"; event.gift.gif = undefined; event.gift.icon = undefined; event.gift.blindWebp = "/wealth-levels/2.png"; }
  if (event.emoticon) event.emoticon.url = "/wealth-levels/1.png";
  if (event.emotes) for (const emote of Object.values(event.emotes)) emote.url = "/wealth-levels/1.png";
  return event;
}

function compare(a: Pick<ArchiveEventRecord, "eventTs" | "ordinal" | "eventKey">, b: Pick<ArchiveEventRecord, "eventTs" | "ordinal" | "eventKey">) {
  return a.eventTs - b.eventTs || a.ordinal - b.ordinal || a.eventKey.localeCompare(b.eventKey);
}

function createSession(sessionId: string, ended: boolean): ArchiveSessionSummary {
  const startedAt = start + (ended ? 0 : 10000000);
  return { sessionId, ownerId: FIXTURE_OWNER, roomId: 6431492, title: ended ? "合成场次一" : "合成场次二", titleSource: "bilibili", identityEvidence: "source-live-time",
    startedAt, endedAt: ended ? startedAt + 3600000 : null, status: ended ? "ended" : "active", recordingStatus: ended ? "stopped" : "recording",
    quality: ended ? "complete" : "in-progress", qualityReason: null, qualityReasons: [], stopReason: null, createdAt: start, updatedAt: start,
    durationMs: ended ? 3600000 : null, eventCount: 720, paidTotal: 0, favoriteCount: 0 };
}

export function createNativeEventRepository(lotteryScene: boolean | 'pocket' = false) {
  const sessions = [createSession("fixture-session-1", true), createSession(FIXTURE_SESSION, false)];
  const records: ArchiveEventRecord[] = [];
  const queries: { query: ArchiveEventQuery; returned: number; nextCursor: string | null }[] = [];
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach(listener => listener());
  const add = (session: ArchiveSessionSummary, index: number) => {
    const event = createFixtureEvent(index, session.sessionId, lotteryScene);
    const sample = rows[index % rows.length];
    records.push({ eventKey: event.id, sessionId: session.sessionId, roomId: event.roomId, ordinal: index, eventTs: event.ts,
      primaryCategory: lotteryScene && (index === 359 || index === 360) ? lotteryScene === 'pocket' ? "gift" : "lottery" : index === 360 || index === 361 ? "danmu" : sample.primaryCategory!, secondaryCategory: lotteryScene === 'pocket' && (index === 359 || index === 360) ? 'redPocket' : index === 360 || index === 361 ? null : sample.secondaryCategory,
      userUid: event.user?.uid ?? null, userName: event.user?.uname ?? null, searchText: event.text ?? event.sc?.message ?? event.gift?.name ?? "", payloadJson: JSON.stringify(event), sourceId: null, favorited: false,
      sessionTitle: session.title, sessionStartedAt: session.startedAt, sessionEndedAt: session.endedAt, sessionStatus: session.status,
      sessionRecordingStatus: session.recordingStatus, sessionQuality: session.quality, sessionQualityReason: session.qualityReason,
      sessionStopReason: session.stopReason, sessionQualityReasons: session.qualityReasons });
  };
  for (const session of sessions) for (let index = 0; index < 720; index++) add(session, index);
  const repository: Pick<ArchiveRepositoryContract, "queryEvents" | "setFavorite" | "getEvent"> = {
    async queryEvents(query) {
      const cursor: ArchiveEventCursor | null = query.cursor ? JSON.parse(decodeURIComponent(query.cursor)) : null;
      const direction = cursor?.direction ?? query.direction ?? "asc";
      const sign = direction === "asc" ? 1 : -1;
      const scoped = records.filter(row => (!query.sessionId || row.sessionId === query.sessionId) && (!query.ownerId || query.ownerId === FIXTURE_OWNER));
      // 逐条投影只复用筛选，不在查询端提前合并礼物；合并仍由真实时间线消费。
      const candidates = scoped.filter(row => projectArchiveEvents([row], { filters: query.filters }).length > 0).sort((a, b) => sign * compare(a, b));
      let anchor = query.anchor?.eventKey ? candidates.find(row => row.eventKey === query.anchor?.eventKey) : undefined;
      if (!anchor && query.anchor?.fallbackEventTs != null) {
        const fallback = query.anchor.fallbackEventTs;
        anchor = [...candidates].sort((a, b) => Math.abs(a.eventTs - fallback) - Math.abs(b.eventTs - fallback)
          || sign * compare(a, b))[0];
      }
      const remaining = cursor ? candidates.filter(row => sign * compare(row, cursor) > 0) : anchor ? candidates.filter(row => sign * compare(row, anchor!) >= 0) : candidates;
      const limit = query.limit ?? 100;
      const items = remaining.slice(0, limit).map(row => ({ ...row }));
      const last = items.at(-1);
      const nextCursor = remaining.length > limit && last ? encodeURIComponent(JSON.stringify({ eventTs: last.eventTs, ordinal: last.ordinal, eventKey: last.eventKey, direction })) : null;
      queries.push({ query: structuredClone(query), returned: items.length, nextCursor });
      notify();
      return { items, nextCursor, totalCount: !cursor && query.includeTotal ? candidates.length : null };
    },
    async setFavorite(eventKey, favorited) {
      const row = records.find(row => row.eventKey === eventKey);
      if (!row) throw new Error("合成事件不存在");
      row.favorited = favorited;
      notify();
    },
    async getEvent(eventKey) { return records.find(row => row.eventKey === eventKey) ?? null; },
  };
  return { repository, records, sessions, queries, targetA: FIXTURE_TARGET_A, targetB: FIXTURE_TARGET_B,
    subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    append(count = 1) {
      const session = sessions[1];
      for (let n = 0; n < count; n++) { add(session, session.eventCount ?? 720); session.eventCount = (session.eventCount ?? 720) + 1; }
      notify();
    },
  };
}
