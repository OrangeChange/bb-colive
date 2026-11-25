import { applyThemeToDocument } from "../../src/theme";
import { setUiLanguage } from "../../src/i18n/index";
import { createRoot } from "react-dom/client";
import { RoomInsightsProvider } from "../../src/hooks/useRoomInsights";
import { ReviewPanel } from "../../src/components/ReviewPanel";
import { useGeneralSettings } from "../../src/generalSettings";
import type { ArchiveRepositoryContract } from "../../src/archive/archiveTypes";
import "../../src/shadcn.css";

const params = new URLSearchParams(location.search);
const now = new Date(2026, 10, 25, 20, 15).getTime();
const face =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#dc6091"/><circle cx="40" cy="32" r="13" fill="#fff"/><path d="M18 67a22 22 0 0 1 44 0" fill="#fff"/></svg>',
  );
const cover =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#4c688b"/><circle cx="235" cy="55" r="32" fill="#f7dca4"/><path d="M0 160 110 50 220 180" fill="#678b72"/></svg>',
  );
const anchors = [
  {
    roomIdInput: "101",
    realRoomId: 101,
    uname: "示例主播",
    face,
    liveStatus: 1 as const,
    lastConnectedAt: now,
  },
  {
    roomIdInput: "102",
    realRoomId: 102,
    uname: "名称较长的主播与配信者Channel",
    face,
    liveStatus: 0 as const,
    lastConnectedAt: now - 1,
  },
];
const owners = anchors.map((a, i) => ({
  ownerId: `room:${a.realRoomId}`,
  roomId: a.realRoomId,
  uid: String(100 + i),
  name: a.uname,
  avatarUrl: face,
  createdAt: now,
  updatedAt: now,
  sessionCount: 3,
  eventCount: 120,
  paidTotal: 300,
  favoriteCount: 1,
  incompleteSessionCount: 1,
  latestSessionAt: now,
}));
const sessions = [
  "今晚一起看星星与聊天",
  "长标题场次：回看内容与排序筛选在窄窗口中的展示",
  "正在记录的直播",
].map((title, i) => ({
  sessionId: `fixture-${i}`,
  ownerId: "room:101",
  roomId: 101,
  title,
  titleSource: "bilibili",
  identityEvidence: "source-live-time",
  startedAt: now - i * 86400000,
  endedAt: i === 2 ? null : now - i * 86400000 + 3600000,
  status: i === 2 ? "active" : "ended",
  recordingStatus: i === 2 ? "recording" : "stopped",
  quality: i === 1 ? "incomplete" : i === 2 ? "in-progress" : "complete",
  qualityReason: null,
  qualityReasons: i === 1 ? ["connection-error"] : [],
  stopReason: null,
  createdAt: now,
  updatedAt: now,
  durationMs: i === 2 ? null : 3600000,
  eventCount: 40,
  paidTotal: 100,
  favoriteCount: 1,
  coverUrl: cover,
}));
const events = Array.from({ length: 40 }, (_, i) => {
  const eventKey = `event-${i}`,
    eventTs = now + i * 1000;
  return {
    eventKey,
    sessionId: "fixture-0",
    roomId: 101,
    ordinal: i,
    eventTs,
    primaryCategory: "danmu",
    secondaryCategory: null,
    userUid: String(i + 1),
    userName: `观众${i + 1}`,
    searchText: "欢迎回来，一起看今晚的直播",
    sourceId: null,
    favorited: i === 0,
    payloadJson: JSON.stringify({
      id: eventKey,
      roomId: 101,
      ts: eventTs,
      msgType: 0,
      text: "欢迎回来，一起看今晚的直播",
      user: {
        uid: String(i + 1),
        uname: `观众${i + 1}`,
        avatar: face,
        guardLevel: 0,
      },
    }),
  };
});
const favorite = {
  sourceKind: "archive",
  stableId: events[0].eventKey,
  eventKey: events[0].eventKey,
  legacyKey: null,
  sessionId: "fixture-0",
  ownerId: "room:101",
  ownerName: owners[0].name,
  roomId: 101,
  sessionTitle: sessions[0].title,
  sessionStartedAt: now,
  sessionEndedAt: now + 3600000,
  eventTs: now,
  favoritedAt: now,
  primaryCategory: "danmu",
  secondaryCategory: null,
  userUid: "1",
  userName: "观众1",
  userNickname: null,
  searchText: events[0].searchText,
  payloadJson: events[0].payloadJson,
  event: JSON.parse(events[0].payloadJson),
  canLocate: true,
  label: null,
  note: "一条收藏备注",
  tags: ["有趣"],
};
const methods = {
  listOwners: async () => {
    if (params.has("error")) throw new Error("读取档案失败，请重试");
    if (params.has("loading")) return new Promise(() => {});
    return params.has("empty") ? [] : owners;
  },
  listSessions: async () => sessions,
  getSession: async (id: string) => sessions.find((s) => s.sessionId === id),
  queryEvents: async () => ({
    items: events,
    nextCursor: null,
    totalCount: events.length,
  }),
  queryOwnerEventGroups: async () => ({
    items: sessions.map((session) => ({
      session,
      matches: events.slice(0, 3),
      matchCount: 40,
      latestMatchTs: now,
    })),
    nextOffset: null,
    hasMore: false,
  }),
  queryFavorites: async () => ({
    items: [favorite],
    nextCursor: null,
    totalCount: 1,
  }),
  listFavoriteTags: async () => [
    { tagId: 1, name: "有趣", createdAt: now, updatedAt: now, usageCount: 1 },
  ],
  getFavoriteOrganization: async () => ({
    note: "一条收藏备注",
    tags: ["有趣"],
  }),
  getStats: async () => ({
    sessionCount: 3,
    eventCount: 120,
    paidTotal: 300,
    favoriteCount: 1,
  }),
  getEvent: async () => events[0],
  getDeletePreview: async () => ({ownerCount:1,sessionCount:1,sessionIds:["fixture-0"],sessionSnapshots:[],eventCount:40,favoriteCount:1,resourceReferenceCount:0,bytes:20480,blockedSessionCount:0,blockedSessionIds:[],blockedSessionStates:[]}),
};
const repository = new Proxy(methods, {
  get(target, key) {
    if (key in target) return target[key as keyof typeof methods];
    return async () => {
      throw new Error(`未模拟的档案操作：${String(key)}`);
    };
  },
}) as unknown as ArchiveRepositoryContract;
useGeneralSettings.setState({ reviewOpenCurrentOwner: false });
applyThemeToDocument("sakura", params.has("dark") ? "dark" : "light");
setUiLanguage(params.get("lang") ?? "zh-CN");
createRoot(document.getElementById("root")!).render(
  <main className="flex h-screen min-h-0 flex-col bg-bg text-t1">
    <RoomInsightsProvider>
      <ReviewPanel
        repository={repository}
        anchors={params.has("empty") ? [] : anchors}
        active
        refreshKey="fixture"
        onOpenCloudRecoverySettings={() => {}}
      />
    </RoomInsightsProvider>
  </main>,
);
