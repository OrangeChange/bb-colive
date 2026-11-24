import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReviewOwnerSessionFilters } from "../../src/components/ReviewOwnerSessionFilters";
import { ReviewOwnerList } from "../../src/components/ReviewOwnerList";
import { ReviewSessionTimeline } from "../../src/components/ReviewSessionTimeline";
import { ReviewOwnerEventResults } from "../../src/components/ReviewOwnerEventResults";
import { createReviewReadingMemoryStore } from "../../src/archive/reviewReadingMemory";
import { createDefaultReviewOwnerState } from "../../src/archive/archiveState";
import { isArchiveSessionRecording } from "../../src/archive/archiveSessionState";
import type { ArchiveSessionSummary, ArchiveRepositoryContract, ArchiveEventRecord } from "../../src/archive/archiveTypes";
import { actionButtonClass } from "../../src/components/actionButtonStyles";
import "../../src/App.css";

const base: ArchiveSessionSummary = {
  sessionId: "fixture-current", ownerId: "room:101", roomId: 101, title: "周末直播", titleSource: "bilibili",
  identityEvidence: "source-live-time", startedAt: new Date(2026, 9, 3, 19).getTime(), endedAt: null,
  status: "active", recordingStatus: "recording", quality: "in-progress", qualityReason: null, qualityReasons: [], stopReason: null,
  createdAt: 1, updatedAt: 1, durationMs: null, eventCount: 1, paidTotal: 0, favoriteCount: 0,
};
const scenarios: Record<string, Partial<ArchiveSessionSummary>> = {
  "进行中": {},
  "恢复记录": { quality: "incomplete", qualityReasons: ["connection-switched"] },
  "重连中": { status: "unclean", recordingStatus: "reconnecting", quality: "incomplete", qualityReasons: ["connection-error"], stopReason: "connection-error" },
  "已停止": { status: "unclean", recordingStatus: "stopped", quality: "incomplete", qualityReasons: ["connection-switched"], stopReason: "connection-switched" },
  "未知开播": { identityEvidence: "unavailable", qualityReason: "start-time-unknown" },
  "缺失标题": { title: "2026-10-03 19:00 直播", titleSource: "time" },
  "多原因": { titleSource: "time", title: "2026-10-03 19:00 直播", quality: "incomplete", qualityReasons: ["connection-switched", "live-start-not-captured"] },
  "新增原因": { titleSource: "time", title: "2026-10-03 19:00 直播", quality: "incomplete", qualityReasons: ["app-exit", "connection-switched", "live-start-not-captured"] },
  "已结束": { status: "ended", recordingStatus: "stopped", quality: "complete", endedAt: base.startedAt + 3600000, durationMs: 3600000 },
  "场次待加载": {},
};

function eventFor(session: ArchiveSessionSummary, ordinal: number): ArchiveEventRecord {
  const eventKey = `${session.sessionId}:event:${ordinal}`;
  const eventTs = session.startedAt + ordinal * 1000;
  return {
    eventKey, sessionId: session.sessionId, roomId: 101, ordinal, eventTs, primaryCategory: "danmaku", secondaryCategory: null,
    userUid: "123", userName: "观众", searchText: "今晚好", sourceId: null, favorited: false,
    payloadJson: JSON.stringify({ id: eventKey, roomId: 101, ts: eventTs, msgType: 0, content: "今晚好，欢迎回来", user: { uid: "123", uname: "观众", guardLevel: 0 } }),
    sessionTitle: session.title, sessionStartedAt: session.startedAt, sessionStatus: session.status,
    sessionQuality: session.quality, sessionQualityReason: session.qualityReason, sessionRecordingStatus: session.recordingStatus,
    sessionStopReason: session.stopReason, sessionQualityReasons: session.qualityReasons,
  };
}

function Fixture() {
  const [scenario, setScenario] = useState("进行中");
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [query, setQuery] = useState(createDefaultReviewOwnerState().sessionQuery);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState(true);
  const [history, setHistory] = useState(false);
  const [writer, setWriter] = useState<"pending" | "failed" | undefined>();
  const current = { ...base, ...scenarios[scenario] };
  const sessions: ArchiveSessionSummary[] = [current,
    { ...base, sessionId: "fixture-ended", title: "完整场次", status: "ended", recordingStatus: "stopped", quality: "complete", endedAt: base.startedAt + 3600000, durationMs: 3600000 },
    { ...base, sessionId: "fixture-unknown", title: "停止的未知场次", status: "unclean", recordingStatus: "stopped", stopReason: "previous-runtime", qualityReason: "previous-runtime" }];
  const visible = sessions.filter(s => (!query.status?.length || query.status.includes(s.status)) && (!query.quality?.length || query.quality.includes(s.quality)) && (!query.title || s.title?.includes(query.title)) && (!query.favoriteOnly || (s.favoriteCount ?? 0) > 0));
  const readingMemory = useMemo(createReviewReadingMemoryStore, []);
  const records = sessions.map((s, i) => eventFor(s, i));
  const repository = {
    queryEvents: async (q: { ownerId?: string; sessionId?: string }) => ({ items: q.ownerId ? records : records.filter(r => r.sessionId === q.sessionId), nextCursor: null, totalCount: q.ownerId ? records.length : 1 }),
  } as unknown as ArchiveRepositoryContract;
  const toggle = (id: string, value: boolean) => setSelected(ids => value ? [...new Set([...ids, id])] : ids.filter(item => item !== id));
  return <main className="bg-bg text-t1" style={{ height: "100vh", overflow: "auto", padding: 16 }}>
    <div className="flex flex-wrap gap-2 pb-3">
      {Object.keys(scenarios).map(name => <button key={name} className={actionButtonClass} aria-pressed={scenario === name} onClick={() => setScenario(name)}>{name}</button>)}
      <button className={actionButtonClass} onClick={() => { document.documentElement.classList.toggle("dark", !dark); setDark(!dark); }}>{dark ? "浅色主题" : "深色主题"}</button>
      <button className={actionButtonClass} onClick={() => setNarrow(!narrow)}>{narrow ? "宽面板" : "窄面板"}</button>
      <button className={actionButtonClass} onClick={() => setOpened(!opened)}>{opened ? "离开时间线" : "重新进入时间线"}</button>
      <button className={actionButtonClass} onClick={() => setHistory(!history)}>{history ? "单场时间线" : "主播历史"}</button>
      <button className={actionButtonClass} onClick={() => setWriter(writer === "pending" ? undefined : "pending")}>保存中</button>
      <button className={actionButtonClass} onClick={() => setWriter(writer === "failed" ? undefined : "failed")}>保存失败</button>
    </div>
    <div className="flex min-w-0 flex-col gap-3" style={{ width: narrow ? 360 : "100%", maxWidth: 960 }}>
      <ReviewOwnerSessionFilters query={query} onChange={patch => setQuery(q => ({ ...q, ...patch }))} onClear={() => setQuery(createDefaultReviewOwnerState().sessionQuery)} collapsed={false} onCollapsedChange={() => {}} />
      <ReviewOwnerList level="owner" anchors={[]} owners={[]} owner={null} sessions={visible} onOpenOwner={() => {}} onOpenSession={() => setOpened(true)} selectedSessionIds={selected} onToggleSession={toggle} onToggleAllSessions={value => setSelected(value ? visible.filter(s => !isArchiveSessionRecording(s)).map(s => s.sessionId) : [])} onClearSelection={() => setSelected([])} />
      <div className="flex min-h-0 flex-col" style={{ height: 360 }}>
        {opened && <ReviewSessionTimeline repository={repository} readingMemory={readingMemory} sessionId={current.sessionId} ownerId={history ? base.ownerId : undefined} searchScope={history ? "owner" : "session"} session={scenario === "场次待加载" ? undefined : current} refreshKey={scenario} onSpeakEvent={() => {}} onToggleFavorite={() => {}} archiveWriterStatus={writer} />}
      </div>
      <ReviewOwnerEventResults page={{ items: [{ session: current, matches: [records[0]], matchCount: 1, latestMatchTs: records[0].eventTs }], nextOffset: null, hasMore: false }} loading={false} error={null} hasConditions={false} onOpenMatch={() => {}} onLoadMore={() => {}} onClear={() => {}} />
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
