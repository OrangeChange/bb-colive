import { readReviewTimelineSources } from "./helpers/reviewTimelineSources.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { componentRuntime, findElement } from "./helpers/componentRuntime.mjs";
import * as archiveState from "../src/archive/archiveState.ts";
import { createOwnerEventQueryKey } from "../src/archive/reviewOwnerEventQueryState.ts";
import { getOwnerEventDisplayPage } from "../src/archive/reviewOwnerEventResultsState.ts";
import { createReviewReadingMemoryStore } from "../src/archive/reviewReadingMemory.ts";
import fs from "node:fs";

const root = new URL("../", import.meta.url);

function read(relativePath) {
  try {
    return fs.readFileSync(new URL(relativePath, root), "utf8");
  } catch {
    return "";
  }
}

const appSource = readApplicationSources();
const sidebarSource = read("src/components/Sidebar.tsx");
const panelSource = read("src/components/ReviewPanel.tsx");
const ownerListSource = read("src/components/ReviewOwnerList.tsx");
const coverSource = read("src/components/ArchiveCoverThumbnail.tsx");
const previewSource = read("src/components/ImagePreviewOverlay.tsx");
const eventMenuSource = read("src/components/EventContextMenu.tsx");
const searchSource = read("src/components/ReviewSearchControls.tsx");
const filterShellSource = read("src/components/ReviewFilterShell.tsx");
const eventRowSource = read("src/components/EventRow.tsx");
const styleSource = read("src/App.css");
const stateSource = read("src/archive/archiveState.ts");
const connectionSource = read("src/stores/connection.ts");
const archiveRuntimeSource = read("src/archive/archiveRuntime.ts");

test("回看状态以真实房间号合并主播卡，并保留无档案主播", async () => {
  assert.ok(stateSource, "archiveState.ts 尚未创建");
  const { mergeReviewOwners } = await import("../src/archive/archiveState.ts");
  const anchors = [
    { realRoomId: 13579, roomIdInput: "2468", uname: "主播甲", lastConnectedAt: 10 },
    { realRoomId: 97531, roomIdInput: "97531", uname: "主播乙", lastConnectedAt: 9 },
  ];
  const owners = [{
    ownerId: "room:13579",
    roomId: 13579,
    uid: null,
    name: "历史主播甲",
    avatarUrl: null,
    createdAt: 1,
    updatedAt: 2,
    sessionCount: 2,
    eventCount: 20,
    paidTotal: 12.345,
    favoriteCount: 3,
    incompleteSessionCount: 1,
    latestSessionAt: 100,
  }, {
    ownerId: "room:24680",
    roomId: 24680,
    uid: null,
    name: "历史主播丙",
    avatarUrl: null,
    createdAt: 3,
    updatedAt: 4,
    sessionCount: 1,
    eventCount: 7,
    paidTotal: 0,
    favoriteCount: 0,
    incompleteSessionCount: 0,
    latestSessionAt: 200,
  }];

  assert.deepEqual(
    mergeReviewOwners(anchors, owners).map((item) => ({
      roomId: item.roomId,
      name: item.anchor.uname,
      sessionCount: item.owner?.sessionCount ?? 0,
    })),
    [
      { roomId: 13579, name: "主播甲", sessionCount: 2 },
      { roomId: 97531, name: "主播乙", sessionCount: 0 },
      { roomId: 24680, name: "历史主播丙", sessionCount: 1 },
    ],
  );
});

test("三级回看导航返回父级，并保留父级查询、筛选、排序和滚动状态", async () => {
  assert.ok(stateSource, "archiveState.ts 尚未创建");
  const {
    createReviewHistoryState,
    createDefaultReviewOwnerState,
    getReviewLevelState,
    getReviewEntryRoute,
    navigateBack,
    pushReviewRoute,
    updateReviewLevelState,
  } = await import("../src/archive/archiveState.ts");
  const home = { level: "home" };
  const owner = { level: "owner", roomId: 13579 };
  const session = { level: "session", roomId: 13579, sessionId: "session-1" };
  let history = createReviewHistoryState();
  history = updateReviewLevelState(history, home, {
    query: { searchText: "主播甲", searchScope: "owner", filters: { favoriteOnly: true }, sort: "startedAt", sortDirection: "desc" },
    scrollTop: 128,
  });
  history = pushReviewRoute(history, owner);
  history = updateReviewLevelState(history, owner, {
    query: { searchText: "近期开播", searchScope: "owner", filters: { primaryCategories: ["互动"] }, sort: "eventCount", sortDirection: "asc" },
    scrollTop: 256,
  });
  history = pushReviewRoute(history, session);

  assert.deepEqual(navigateBack(session, history), owner);
  assert.deepEqual(navigateBack(owner, history), home);
  assert.deepEqual(getReviewLevelState(history, home), {
    query: { searchText: "主播甲", searchScope: "owner", filters: { favoriteOnly: true }, sort: "startedAt", sortDirection: "desc" },
    scrollTop: 128,
  });
  assert.deepEqual(getReviewLevelState(history, owner), {
    query: { searchText: "近期开播", searchScope: "owner", filters: { primaryCategories: ["互动"] }, sort: "eventCount", sortDirection: "asc" },
    ownerState: createDefaultReviewOwnerState(),
    scrollTop: 256,
  });
});

test("主播页按主播保存双模式条件，并提供一次性事件跳转目标", async () => {
  const { createReviewHistoryState, getReviewLevelState, pushReviewRoute, updateReviewLevelState } = await import("../src/archive/archiveState.ts");
  const ownerA = { level: "owner", roomId: 13579 };
  const ownerB = { level: "owner", roomId: 97531 };
  let history = pushReviewRoute(createReviewHistoryState(), ownerA);
  history = updateReviewLevelState(history, ownerA, {
    ownerState: {
      mode: "events",
      sessionQuery: { title: "读书FM" },
      eventQuery: { filters: { favoriteOnly: true, keywordConditions: [{ field: "user", value: "小明" }] } },
    },
  });
  history = pushReviewRoute(history, ownerB);
  history = updateReviewLevelState(history, ownerB, {
    ownerState: { sessionQuery: { title: "七月新番" }, eventQuery: { filters: { fromTs: 1234 } } },
  });
  history = updateReviewLevelState(history, ownerA, { targetEventKey: "event-match-1" });

  const ownerAState = getReviewLevelState(history, ownerA);
  const ownerBState = getReviewLevelState(history, ownerB);
  assert.equal(ownerAState.ownerState.mode, "events");
  assert.equal(ownerAState.ownerState.sessionQuery.title, "读书FM");
  assert.deepEqual(ownerAState.ownerState.eventQuery.filters, {
    favoriteOnly: true,
    keywordConditions: [{ field: "user", value: "小明" }],
  });
  assert.equal(ownerAState.targetEventKey, "event-match-1");
  assert.equal(ownerBState.ownerState.mode, "sessions");
  assert.equal(ownerBState.ownerState.sessionQuery.title, "七月新番");
  assert.deepEqual(ownerBState.ownerState.eventQuery.filters, { fromTs: 1234 });
});

test("首次进入回看默认打开当前主播，关闭偏好或无当前主播时进入档案馆总览", async () => {
  const { getReviewEntryRoute } = await import("../src/archive/archiveState.ts");

  assert.deepEqual(getReviewEntryRoute(13579, true), { level: "owner", roomId: 13579 });
  assert.deepEqual(getReviewEntryRoute(13579, false), { level: "home" });
  assert.deepEqual(getReviewEntryRoute(null, true), { level: "home" });
});

test("侧栏启用回看一级入口并报告当前页状态", () => {
  assert.match(sidebarSource, /title="回看"/);
  assert.match(sidebarSource, /activeMainView === "review"/);
  assert.match(sidebarSource, /onSelectMainView\?\.\("review"\)/);
  assert.doesNotMatch(sidebarSource, /disabled[^>]*title="回看/);
});

test("App 持久挂载 ReviewPanel，并通过 hidden 切换而不重新建立现场连接", () => {
  assert.match(appSource, /import \{ ReviewPanel \} from "\.\/components\/ReviewPanel"/);
  assert.match(appSource, /const anchors = useConnection\(\(state\) => state\.anchors\)/);
  assert.match(appSource, /const archiveRevision = useArchiveRuntime\(\(state\) => state\.archiveRevision\)/);
  assert.match(appSource, /hidden=\{mainView !== "review"\}/);
  assert.match(appSource, /<ReviewPanel repository=\{archiveRepository\} anchors=\{anchors\} active=\{mainView === "review"\} refreshKey=\{archiveRevision\}[\s\S]*?onOpenCloudRecoverySettings=\{openCloudRecoverySettings\}[\s\S]*?\/>/);
});

test("hidden-mounted ReviewPanel 直接读取已提交快照，不等待现场 writer 排空", () => {
  assert.match(panelSource, /active: boolean/);
  assert.match(panelSource, /refreshKey: unknown/);
  assert.match(panelSource, /flushArchiveWriter/);
  assert.match(panelSource, /if \(!repository \|\| !active\)/);
  assert.match(panelSource, /\}, \[active, ownersRefreshRevision, repository\]\);/);
  assert.match(panelSource, /ownerSessionQuery/);
  assert.match(panelSource, /archiveSessionQueryFromOwnerQuery/);
  assert.match(panelSource, /ownerState\.mode !== "sessions"/);
  assert.match(archiveRuntimeSource, /flushArchiveWriterAndNotify/);
  assert.doesNotMatch(archiveRuntimeSource, /useConnection|current\.sessions/);
});

test("档案写入完成只在实际刷出批次后刷新回看", () => {
  assert.match(archiveRuntimeSource, /archiveWriterStatus:/);
  assert.match(archiveRuntimeSource, /archiveRevision: result\.flushed > 0/);
  assert.doesNotMatch(
    connectionSource,
    /if \(result\.flushed === 0 \|\| result\.pending > 0 \|\| result\.failed > 0\) return;/,
  );
});

test("回看刷新已有场次时保留当前列表，不反复显示初始加载态", () => {
  assert.match(panelSource, /if \(sessions\.length === 0\) setSessionsLoading\(true\);/);
  assert.doesNotMatch(panelSource, /\n    setSessionsLoading\(true\);\n    setSessionsError\(null\);/);
});

test("主播档案加载中不误显示空态，档案写入不会重启未完成的首次查询", () => {
  assert.match(panelSource, /const \[ownersLoading, setOwnersLoading\] = useState\(false\);/);
  assert.match(panelSource, /const \[ownersRefreshRevision, setOwnersRefreshRevision\] = useState\(0\);/);
  assert.match(panelSource, /\}, \[active, ownersRefreshRevision, repository\]\);/);
  assert.match(panelSource, /if \(!active \|\| ownersLoading\) return;/);
  assert.match(panelSource, /const \[ownerSessionRefreshRevision, setOwnerSessionRefreshRevision\] = useState\(0\);/);
  assert.match(panelSource, /ownerSessionRefreshRevision/);
  assert.doesNotMatch(panelSource, /\}, \[active, managementRevision, owner\?\.ownerId, ownerSessionQuery, ownerState\.mode, refreshKey, repository, route\]\);/);
  assert.match(ownerListSource, /ownersLoading\?: boolean;/);
  assert.match(ownerListSource, /ownersLoading \? "正在加载…" : "暂无档案"/);
  assert.match(ownerListSource, /ownersLoading \? "正在加载主播档案…" : normalizedSearch \? "没有匹配的主播档案" : "暂无主播档案"/);
});

test("评审范围切换在显式清除后失效主播历史快照，未清除时仍恢复本场查询", () => {
  assert.match(panelSource, /if \(!wasOwnerHistory && isOwnerHistory\) \{[\s\S]*preOwnerHistoryQueriesRef\.current\[key\]/);
  assert.match(panelSource, /else if \(wasOwnerHistory && !isOwnerHistory\) \{[\s\S]*delete preOwnerHistoryQueriesRef\.current\[key\];/);
  assert.match(panelSource, /if \(options\.restorePreviousSearch === false\) \{\s*delete preSearchQueriesRef\.current\[key\];\s*delete preOwnerHistoryQueriesRef\.current\[key\];/);
  assert.match(panelSource, /onClearReviewUserFilter[\s\S]*restorePreviousSearch: false/);
  assert.match(panelSource, /clearActiveFilters[\s\S]*restorePreviousSearch: false/);
});

test("回看使用保留的返回按钮和传统层级面包屑", () => {
  assert.match(panelSource, /回看/);
  assert.match(ownerListSource, /主播档案/);
  assert.match(ownerListSource, /直播场次/);
  assert.match(panelSource, /navigateBack/);
  assert.match(panelSource, /aria-label="档案路径"/);
  assert.match(panelSource, /全部主播/);
  assert.match(panelSource, /ownerName/);
  assert.match(panelSource, /selectedSession\?\.title/);
  assert.doesNotMatch(panelSource, /ChevronRightIcon/);
  assert.match(panelSource, /type="button"/);
  assert.match(panelSource, /查看当前主播/);
  assert.match(panelSource, /查看当前场次/);
  assert.match(panelSource, /<ConnectBar \/>/);
});

test("真实回看面包屑跨不同历史入口仍打开指定主播，并保留主播筛选与阅读位置", () => {
  const ReviewOwnerList = () => null;
  const ReviewOwnerSessionFilters = () => null;
  const ownerRoute = { level: "owner", roomId: 101 };
  for (const entry of ["home", "other-owner", "other-session"]) {
    let history = archiveState.updateReviewLevelState(archiveState.createReviewHistoryState(), ownerRoute, {
      scrollTop: 284,
      ownerState: { sessionQuery: { title: "周末", favoriteOnly: true } },
    });
    const connection = { state: { roomId: 101 }, sessions: { 101: { archive: { sessionId: "target-session" } } } };
    const runtime = componentRuntime("src/components/ReviewPanel.tsx", {
      "../archive/archiveState.ts": {
        ...archiveState,
        createReviewHistoryState: () => history,
        getReviewLevelState: (current, route) => { history = current; return archiveState.getReviewLevelState(current, route); },
      },
      "../archive/archiveQuery.ts": { hasArchiveKeywordConditions: () => false },
      "../archive/reviewOwnerEventQueryState.ts": { createOwnerEventQueryKey },
      "../archive/reviewOwnerEventResultsState.ts": { getOwnerEventDisplayPage },
      "../archive/reviewReadingMemory.ts": { createReviewReadingMemoryStore },
      "./ReviewSearchControls": { filterConditionCount: () => 0 },
      "./ReviewOwnerList": { ReviewOwnerList },
      "./ReviewOwnerSessionFilters": { ReviewOwnerSessionFilters },
      "../stores/connection": { useConnection: selector => selector(connection) },
      "../generalSettings.ts": { useGeneralSettings: selector => selector({}) },
      "../archive/archiveRuntime.ts": { useArchiveRuntime: selector => selector({ archiveMutationRevision: 0 }) },
      "../eventDisplaySettings.ts": { resolveReviewBigEmoteWidth: () => 80 },
      "../archive/archiveDiagnostics.ts": { recordArchiveDiagnostic() {} },
    });
    const render = () => runtime.render("ReviewPanel", { repository: null, anchors: [], active: true, refreshKey: 0 });
    const element = predicate => {
      const found = findElement(render(), predicate);
      assert.ok(found, `缺少导航入口：${entry}`);
      return found;
    };
    if (entry !== "home") {
      element(node => node.type === ReviewOwnerList).props.onOpenOwner(202);
      if (entry === "other-session") element(node => node.type === ReviewOwnerList).props.onOpenSession(202, "other-session");
    }
    element(node => node.type === "button" && node.props.children === "查看当前场次").props.onClick();
    element(node => node.props["aria-label"] === "返回当前主播档案").props.onClick();
    assert.equal(element(node => node.props["data-review-route"]).props["data-review-route"], "owner:101");
    assert.equal(element(node => node.type === ReviewOwnerSessionFilters).props.query.title, "周末");
    assert.equal(element(node => node.type === ReviewOwnerSessionFilters).props.query.favoriteOnly, true);
    assert.equal(archiveState.getReviewLevelState(history, ownerRoute).scrollTop, 284);
    element(node => node.props["aria-label"] === "返回所有主播档案馆").props.onClick();
    assert.equal(element(node => node.props["data-review-route"]).props["data-review-route"], "home");
    assert.deepEqual(history.stack, [{ level: "home" }]);
    assert.equal(archiveState.getReviewLevelState(history, ownerRoute).scrollTop, 284);
    runtime.close();
  }
});

test("回看标题和导航使用紧凑按钮，不展示重叠的大标题或文字箭头", () => {
  assert.doesNotMatch(panelSource, /<h1 className="ui-type-page-title text-t1">回看<\/h1>/);
  assert.doesNotMatch(panelSource, /更多 → 管理档案/);
  assert.match(panelSource, /管理档案/);
  assert.match(panelSource, /aria-label="返回所有主播档案馆"/);
});

test("场次封面使用统一固定比例组件，并覆盖场次列表和单场标题栏", () => {
  assert.ok(coverSource, "ArchiveCoverThumbnail.tsx 尚未创建");
  assert.match(coverSource, /aspect-\[16\/9\]/);
  assert.match(coverSource, /暂无封面/);
  assert.match(ownerListSource, /ArchiveCoverThumbnail/);
  assert.match(ownerListSource, /session\.coverUrl/);
  assert.match(panelSource, /ArchiveCoverThumbnail/);
  assert.match(panelSource, /selectedSession\?\.coverUrl/);
});

test("封面和头像共用可关闭的图片预览遮罩", () => {
  assert.ok(previewSource, "ImagePreviewOverlay.tsx 尚未创建");
  assert.match(coverSource, /ImagePreviewOverlay/);
  assert.match(coverSource, /查看封面预览/);
  assert.match(coverSource, /showImage/);
  assert.match(eventMenuSource, /ImagePreviewOverlay/);
  assert.match(previewSource, /role="dialog"/);
  assert.match(previewSource, /aria-modal="true"/);
  assert.match(previewSource, /Escape/);
  assert.match(previewSource, /pointerEvent\.target === pointerEvent\.currentTarget/);
  assert.match(previewSource, /closeLabel/);
});

test("回看筛选使用中文组合和排序文案", () => {
  const ownerSessionFilters = read("src/components/ReviewOwnerSessionFilters.tsx");
  const ownerEventResults = read("src/components/ReviewOwnerEventResults.tsx");
  const advancedFilters = read("src/components/ReviewSearchControls.tsx");
  assert.doesNotMatch(searchSource, />AND<|>OR<|新 → 旧|旧 → 新/);
  assert.match(searchSource, /<UiSelect/);
  assert.match(searchSource, /options=\{\[\{ value: "and", label: "且" \}, \{ value: "or", label: "或" \}\]\}/);
  assert.doesNotMatch(searchSource, /<select|<option/);
  assert.doesNotMatch(searchSource, /关键词组合方式/);
  assert.match(ownerSessionFilters, /formatArchiveSortDirection\(value, query\.sort\)/);
  assert.match(ownerEventResults, /formatArchiveSortDirection\(value, sort\)/);
  assert.match(advancedFilters, /aria-label="回看分类条件"/);
  assert.match(advancedFilters, /用户身份/);
  assert.match(advancedFilters, /主播粉丝牌/);
  assert.match(advancedFilters, /礼物最低价格/);
  assert.match(advancedFilters, /时间范围/);
});

test("回看筛选把昵称并入用户，并提供身份和礼物价格范围", () => {
  assert.match(searchSource, /value: "user", label: "用户"/);
  assert.doesNotMatch(searchSource, /value: "nickname", label: "昵称"/);
  assert.match(searchSource, /用户身份/);
  assert.match(searchSource, /普通用户/);
  assert.match(searchSource, /礼物最低价格/);
  assert.match(searchSource, /礼物最高价格/);
  assert.match(searchSource, /单件价格/);
  assert.match(searchSource, /本条累计/);
});

test("主播页和场次页的管理档案入口都在右侧，并只在路由或管理状态切换时重置滚动位置", () => {
  assert.match(panelSource, /showManagement/);
  assert.match(panelSource, /sessionOnly/);
  assert.match(panelSource, /route\.level === "session"[\s\S]*管理档案/);
  assert.match(panelSource, /resolveReviewScrollTop/);
  assert.match(panelSource, /reviewScrollContextKey/);
  assert.match(panelSource, /reviewScrollContextRef/);
  assert.doesNotMatch(panelSource, /scrollTop = showManagement && route\.level === "owner"/);
  assert.doesNotMatch(panelSource, /\[ownerState\.mode, route\.level, routeKey, sessionsLoadedRouteKey, showManagement\]/);
  assert.match(panelSource, /historyRef\.current/);
  assert.doesNotMatch(panelSource, /\[history, ownerState\.mode/);
});

test("管理档案面板不再重复提供内部关闭按钮", () => {
  const managementSource = read("src/components/ReviewArchiveManagement.tsx");
  assert.doesNotMatch(managementSource, /onClick=\{closeManagement\}>关闭<\/button>/);
  assert.match(panelSource, /管理档案/);
});

test("回看设置按传输、保留策略和空间清理分组", () => {
  const settingsSource = read("src/components/ReviewArchiveSettings.tsx");
  const css = read("src/App.css");
  assert.match(settingsSource, /aria-label="档案传输"/);
  assert.match(settingsSource, /aria-label="保留策略"/);
  assert.match(settingsSource, /aria-label="空间与清理"/);
  assert.match(css, /\.settings-review-group\s*\{/);
  assert.match(css, /\.settings-review-group \.settings-control-row/);
  assert.match(settingsSource, /settings-review-setting/);
  assert.match(css, /\.settings-review-setting\s*\{/);
  assert.match(css, /\.settings-review-setting-actions/);
  assert.match(settingsSource, /<UiSelect/);
  assert.match(settingsSource, /value: "7", label: "最近 7 天"/);
  assert.match(settingsSource, /value: "all", label: "全部档案"/);
  assert.match(settingsSource, /deleteMode === "all"/);
});

test("主播卡用主题色突出直播状态，并提供可降级的头像水波动画", () => {
  assert.match(ownerListSource, /review-live-status/);
  assert.match(ownerListSource, /review-live-status--live/);
  assert.match(ownerListSource, /review-live-pulse/);
  assert.match(ownerListSource, /text-accent/);
  assert.match(styleSource, /review-live-pulse::before[\s\S]*border:\s*2px solid currentColor/);
  assert.match(styleSource, /review-live-pulse::after/);
  assert.match(styleSource, /@keyframes review-live-glow/);
  assert.match(styleSource, /@keyframes review-live-pulse/);
  assert.match(styleSource, /prefers-reduced-motion/);
});

test("主播档案卡支持键盘可达的置顶切换，且不与进入档案按钮嵌套", () => {
  assert.match(ownerListSource, /置顶主播/);
  assert.match(ownerListSource, /取消置顶/);
  assert.match(ownerListSource, /aria-pressed/);
  assert.match(ownerListSource, /setReviewOwnerPinned/);
  assert.match(ownerListSource, /focus-within/);
  assert.match(ownerListSource, /<article[\s\S]*<button[\s\S]*打开\$\{card\.anchor\.uname\}[\s\S]*<\/button>[\s\S]*<button/);
});

test("置顶按钮位于进入档案箭头左侧，并使用向上顶的图标", () => {
  const cardStart = ownerListSource.indexOf("<article");
  const cardEnd = ownerListSource.indexOf("</article>", cardStart);
  const cardSource = ownerListSource.slice(cardStart, cardEnd);
  const pinIndex = cardSource.indexOf("aria-label={pinned ?");
  const entryChevronIndex = cardSource.indexOf('<LucideChevronRight');
  assert.ok(pinIndex >= 0 && entryChevronIndex >= 0 && pinIndex < entryChevronIndex);
  assert.match(cardSource, /<LucidePin/);
  assert.match(cardSource, /<LucideChevronRight[^>]*className="[^"]*pointer-events-none/);
  assert.match(cardSource, /after:absolute after:inset-0/);
});

test("主播档案置顶按钮独立切换状态，不触发进入档案", () => {
  const Pin = () => null;
  const runtime = componentRuntime("src/components/ReviewOwnerList.tsx", {"lucide-react": {Pin}}, ["OwnerCard"]);
  const calls = [];
  for (const pinned of [false, true]) {
    const tree = runtime.render("OwnerCard", {card:{roomId:101,anchor:{uname:"主播甲",liveStatus:0}},pinned,ownersLoading:false,
      onOpen:roomId=>calls.push(["open",roomId]),onTogglePinned:(roomId,value)=>calls.push(["pin",roomId,value])});
    const entry = findElement(tree, node=>node.type==='button' && node.props['aria-label']==='打开主播甲的主播档案');
    const pin = findElement(tree, node=>node.type==='button' && node.props['aria-label']===(pinned?'取消置顶主播甲':'置顶主播主播甲'));
    assert.ok(entry);assert.ok(pin);
    assert.equal(findElement(entry,node=>node===pin),null);
    assert.equal(pin.props['aria-pressed'],pinned);
    assert.ok(findElement(pin,node=>node.type===Pin));
    assert.match(pin.props.className,/group-focus-within:opacity-100|opacity-100/);
    pin.props.onClick();
    assert.deepEqual(calls.at(-1),['pin',101,!pinned]);
  }
  assert.equal(calls.some(([action])=>action==='open'),false);
  runtime.close();
});

test("主播档案场次列表支持当前列表多选和批量删除入口", () => {
  assert.match(ownerListSource, /type="checkbox"/);
  assert.match(ownerListSource, /全选当前列表/);
  assert.match(ownerListSource, /已选/);
  assert.match(ownerListSource, /删除所选/);
  assert.match(ownerListSource, /aria-checked|indeterminate/);
  assert.match(ownerListSource, /记录中或重连中的场次不可删除/);
  assert.match(panelSource, /selectedSessionIds/);
});

test("ReviewPanel 和子视图复用 App 提供的 repository，不自行打开数据库连接", () => {
  assert.match(panelSource, /repository: ArchiveRepositoryContract \| null/);
  assert.match(panelSource, /ReviewOwnerList/);
  assert.doesNotMatch(`${panelSource}\n${ownerListSource}`, /openArchiveDatabase|new ArchiveRepository/);
});

test("ReviewPanel 查询为 listOwners/listSessions，阅读位置使用运行期内存", () => {
  assert.match(panelSource, /createArchiveRequestId/);
  assert.match(panelSource, /listOwners\([\s\S]*recordArchiveDiagnostic/);
  assert.match(panelSource, /listSessions\([\s\S]*recordArchiveDiagnostic/);
  assert.match(panelSource, /createReviewReadingMemoryStore/);
  assert.match(panelSource, /readingMemory/);
  assert.doesNotMatch(panelSource, /getReadingState\(/);
  assert.match(panelSource, /recordArchiveDiagnostic\("cancel"/);
});

test("主播档案列表使用紧凑双行场次入口，并保留暂无档案空态", () => {
  assert.match(ownerListSource, /review-session-row/);
  assert.match(ownerListSource, /暂无档案/);
  assert.match(ownerListSource, /onOpenSession/);
  assert.match(ownerListSource, /session\.sessionId/);
  assert.match(ownerListSource, /session\.eventCount/);
  assert.match(ownerListSource, /session\.paidTotal/);
  assert.match(ownerListSource, /session\.favoriteCount/);
});

test("回看场次显示质量原因，自动恢复阅读位置并提供跳到最新操作", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const ownerList = read("src/components/ReviewOwnerList.tsx");
  const timeline = readReviewTimelineSources();
  assert.doesNotMatch(panel, /QualityBadge/);
  assert.match(ownerList, /getArchiveRecordNotices\(session\)/);
  assert.match(timeline, /getArchiveRecordNotices/);
  assert.match(timeline, /readingMemory/);
  assert.doesNotMatch(timeline, /继续阅读/);
  assert.match(timeline, /跳到最新/);
  assert.match(timeline, /review-reading-reason/);
});

test("回看场次提示可按场次分别关闭，并在再次进入时读取已关闭状态", () => {
  const timeline = readReviewTimelineSources();
  const noticeState = read("src/archive/archiveNoticeState.ts");
  assert.match(timeline, /关闭.*提示/);
  assert.match(timeline, /dismissArchiveNotice/);
  assert.match(timeline, /sessionId/);
  assert.match(noticeState, /sessionStorage/);
  assert.match(noticeState, /sessionId/);
});

test("回看质量、标题和场次身份提醒使用统一的简洁中文文案", () => {
  const qualitySource = read("src/archive/archiveQuality.ts");
  const timeline = readReviewTimelineSources();
  assert.match(qualitySource, /程序上次没有正常关闭，这场直播没有收到下播消息/);
  assert.match(qualitySource, /没有获取到直播标题，已使用时间命名/);
  assert.match(qualitySource, /没有获取到开播时间，无法确认是否为同一场/);
  assert.match(ownerListSource, /getArchiveRecordNotices/);
  assert.match(timeline, /getArchiveRecordNotices/);
  assert.doesNotMatch(`${panelSource}\n${ownerListSource}\n${timeline}`, /formatQualityReason/);
});

test("回看显示当前场次的档案保存状态，并区分待写入和失败重试", () => {
  assert.match(archiveRuntimeSource, /archiveWriterStatus/);
  assert.match(archiveRuntimeSource, /pendingSessionIds/);
  assert.match(archiveRuntimeSource, /failedSessionIds/);
  assert.match(connectionSource, /syncArchiveWriterStatus\(writer\);/);
  assert.match(archiveRuntimeSource, /archiveWriter = ownerRuntime\?\.setArchiveWriter\(archiveWriter\) \?\? archiveWriter;\s+syncArchiveWriterStatus\(archiveWriter\);/);
  assert.match(archiveRuntimeSource, /export async function flushArchiveWriter\(\)[\s\S]*notifyArchiveWriteComplete\(writer, result\)/);
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /保存中…/);
  assert.match(timeline, /保存失败，正在重试/);
  assert.match(panelSource, /archiveWriterStatus/);
});

test("档案保存状态显示在时间线标题栏，不增删回看垂直布局行", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /archiveWriterStatus\?: "pending" \| "failed"/);
  assert.match(timeline, /role="status"/);
  assert.match(timeline, /archiveWriterStatus === "failed" \|\| showArchivePending/);
  assert.doesNotMatch(timeline, /w-\[9rem\].*invisible/);
  assert.doesNotMatch(panelSource, /<ArchiveWriterNotice[\s\S]*?\/>/);
});

test("档案事件写入在短窗口内合并，快速写入不闪保存提示", () => {
  assert.match(archiveRuntimeSource, /ARCHIVE_WRITE_BATCH_DELAY_MS\s*=\s*200/);
  assert.match(connectionSource, /scheduleArchiveWriterFlushAndNotify\(writer\)/);
  assert.match(archiveRuntimeSource, /clearArchiveWriterFlushTimer/);
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /ARCHIVE_PENDING_INDICATOR_DELAY_MS\s*=\s*400/);
  assert.match(timeline, /archiveWriterStatus !== "pending"/);
  assert.match(timeline, /setShowArchivePending/);
});

test("回看顶部检索状态跨主播和场次持久化，并默认倒序", () => {
  const state = read("src/archive/archiveState.ts");
  const panel = read("src/components/ReviewPanel.tsx");
  const timeline = readReviewTimelineSources();
  assert.match(state, /DEFAULT_REVIEW_QUERY_PREFERENCES[\s\S]*sortDirection: "desc"/);
  assert.match(panel, /danmu-review-query-preferences/);
  assert.match(panel, /saveReviewQueryPreferences/);
  assert.match(timeline, /已加载 \{records\.length\}/);
  assert.match(timeline, /includeTotal: cursor === null && \(pageDirection === direction \|\| options\.includeTotal === true\)/);
  assert.match(timeline, /ignoreReadingAnchor: true/);
});

test("主播场次和事件排序分别持久化为全局偏好，不跟随单个主播的筛选状态", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const state = read("src/archive/archiveState.ts");
  assert.match(panel, /danmu-review-owner-sort-preferences/);
  assert.match(panel, /sessionQuery\.sort/);
  assert.match(panel, /eventQuery\.sort/);
  assert.match(panel, /queryOwnerEventGroups/);
  assert.match(panel, /phase: "owner-sessions"/);
  assert.match(panel, /phase: "owner-event-search"/);
  assert.doesNotMatch(panel, /ReviewSearchControls level="owner"/);
  assert.match(state, /ownerState\?: ReviewOwnerState/);
});

test("主播场次条件与事件条件分别进入不同 Repository 查询，模式外不触发查询", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const mapperStart = panel.indexOf("function archiveSessionQueryFromOwnerQuery");
  const mapperEnd = panel.indexOf("function ownerEventQueryHasConditions", mapperStart);
  const mapper = panel.slice(mapperStart, mapperEnd);
  assert.match(mapper, /searchText: query\.title/);
  assert.match(mapper, /fromTs: query\.startedFromTs/);
  assert.match(mapper, /status: query\.status/);
  assert.match(mapper, /quality: query\.quality/);
  assert.doesNotMatch(mapper, /filters:/);
  assert.match(panel, /repository\.listSessions\(archiveSessionQueryFromOwnerQuery\([\s\S]*?ownerSessionQuery/);
  assert.match(panel, /repository\.queryOwnerEventGroups\(query\)/);
  assert.match(panel, /filters: ownerEventQuery\.filters/);
  assert.match(panel, /ownerState\.mode !== "sessions"/);
  assert.match(panel, /ownerState\.mode !== "events"/);
  assert.match(panel, /mergeOwnerEventGroupPage\(currentPage\.page, page, ownerEventQuery\.sort, ownerEventQuery\.direction\)/);
  assert.doesNotMatch(panel, /items: \[\.\.\.currentPage\.page\.items, \.\.\.page\.items\]/);
});

test("筛选区可收起，事件正文允许自然换行而不被裁剪", () => {
  assert.match(searchSource, /ReviewFilterShell/);
  assert.match(filterShellSource, /aria-expanded/);
  assert.match(filterShellSource, /收起筛选|展开筛选/);
  assert.match(eventRowSource, /className="event-body"/);
  assert.doesNotMatch(eventRowSource, /className="event-body[^"\n]*flex-nowrap/);
  assert.doesNotMatch(eventRowSource, /className="event-body[^"\n]*overflow-hidden/);
});

test("回看场次由事件时间线承担主滚动，外层页面不再抢占滚轮", () => {
  assert.match(panelSource, /route\.level === "session" \? "flex flex-col overflow-hidden"/);
  assert.match(panelSource, /route\.level === "session" \? undefined : handleScroll/);
  assert.match(panelSource, /flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4/);
  assert.match(readReviewTimelineSources(), /relative min-h-0 flex-1 overflow-y-auto/);
});

test("档案馆首页支持按主播名称、UID或房间号检索", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const ownerList = read("src/components/ReviewOwnerList.tsx");
  assert.match(panel, /<UiSearchInput aria-label="搜索主播档案"/);
  assert.match(panel, /搜索主播档案/);
  assert.match(ownerList, /ownerSearchText/);
});

test("主播历史检索按场次显示命中数量并支持折叠", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /hitCount/);
  assert.match(timeline, /collapsedSessions/);
  assert.match(timeline, /折叠场次|展开场次/);
});

test("场次入口分别展示 session.status 与 session.quality", () => {
  assert.match(ownerListSource, /formatArchiveSessionStatus\(session\.status\)/);
  assert.match(ownerListSource, /formatArchiveQuality\(session\.quality\)/);
  const displaySource = read("src/archive/archiveDisplay.ts");
  for (const label of ["active", "ended", "complete", "incomplete"]) {
    assert.match(displaySource, new RegExp(`"${label}"`));
  }
});

test("主播全部历史时间线按场次显示边界、日期、标题和质量，避免跨场混淆", () => {
  const timelineSource = readReviewTimelineSources();
  assert.match(timelineSource, /历史事件/);
  assert.match(timelineSource, /session-boundary|sessionBoundary/);
  assert.match(timelineSource, /formatDate|sessionStartedAt/);
  assert.match(timelineSource, /sessionTitle/);
  assert.match(timelineSource, /sessionQuality/);
});

test("主播事件检索结果展示场次归属、命中数量和定位动作", () => {
  const source = read("src/components/ReviewOwnerEventResults.tsx");
  assert.ok(source, "事件检索结果组件尚未创建");
  assert.match(source, /符合条件 \{matchCount\} 条/);
  assert.match(source, /查看本场结果/);
  assert.match(source, /最新事件/);
  assert.match(source, /符合条件数量/);
  assert.doesNotMatch(source, /命中/);
  assert.match(source, /onOpenMatch/);
  assert.match(source, /sessionQuality|session\.quality/);
  assert.match(source, /session\.startedAt/);
});

test("主播场次筛选只在共享筛选框右上角提供清除条件", () => {
  const sessionFilters = read("src/components/ReviewOwnerSessionFilters.tsx");
  assert.match(sessionFilters, /onClear=\{hasConditions \? onClear : undefined\}/);
  assert.doesNotMatch(sessionFilters, /disabled=\{!hasConditions\}[\s\S]*清除条件/);
  assert.match(filterShellSource, /conditionCount > 0 && onClear/);
});

test("设置主播策略时优先显示档案名，再用本机主播名补齐，最后才显示房间号", async () => {
  const settingsSource = read("src/components/ReviewArchiveSettings.tsx");
  assert.match(settingsSource, /useConnection\(\(state\) => state\.anchors\)/);
  assert.equal((settingsSource.match(/getArchiveOwnerLabel\(owner, anchors\)/g) ?? []).length, 2);

  const { getArchiveOwnerLabel } = await import("../src/archive/archiveState.ts");
  const anchors = [
    { realRoomId: 101, uname: "本机主播名", roomIdInput: "101", lastConnectedAt: 1 },
  ];
  assert.equal(getArchiveOwnerLabel({ roomId: 101, name: "档案主播名" }, anchors), "档案主播名");
  assert.equal(getArchiveOwnerLabel({ roomId: 101, name: null }, anchors), "本机主播名");
  assert.equal(getArchiveOwnerLabel({ roomId: 202, name: "  " }, anchors), "房间 202");
});

test("主播历史事件时间线以符合条件说明结果数，不再显示命中术语", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /符合条件 \{entry\.hitCount\} 条/);
  assert.doesNotMatch(timeline, /命中/);
});

test("主播事件检索摘要最多显示三条，并支持折叠、点击和键盘定位", () => {
  const source = read("src/components/ReviewOwnerEventResults.tsx");
  assert.match(source, /matches\.slice\(0,\s*3\)/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /role="button"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === " "/);
  assert.match(source, /onOpenMatch\(session\.roomId,\s*session\.sessionId,\s*match\.eventKey\)/);
  assert.match(source, /archiveLayout[\s\S]*reviewLayout/);
  assert.doesNotMatch(source, /现场标记|标记事件|onToggleMark/);
});

test("主播事件检索状态文案和清除入口完整，分页只在有后续场次时出现", () => {
  const source = read("src/components/ReviewOwnerEventResults.tsx");
  assert.match(source, /正在检索历史事件…/);
  assert.match(source, /没有找到符合条件的事件/);
  assert.match(source, /输入关键词或选择事件条件后开始检索/);
  assert.match(source, /历史事件检索失败：/);
  assert.match(source, /清除条件/);
  assert.match(source, /hasMore\s*&&/);
  assert.match(source, /加载更多场次/);
});

test("主播场次列表可继续加载被分页隐藏的历史场次", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const ownerList = read("src/components/ReviewOwnerList.tsx");
  assert.match(panel, /hasMoreSessions/);
  assert.match(panel, /onLoadMoreSessions/);
  assert.match(ownerList, /加载更多场次/);
  assert.match(ownerList, /hasMoreSessions/);
});

test("场次开播时间选择自定义后会展开起止时间输入", () => {
  const source = read("src/components/ReviewOwnerSessionFilters.tsx");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /value === "custom"[\s\S]*setCustomDateOpen\(true\)/);
  assert.match(source, /customDateOpen\s*\|\|/);
});

test("跳到最新只查询最新一页，不为找到末尾而逐页读完整场次", () => {
  const source = readReviewTimelineSources();
  const jump = source.match(/const jumpToLatest = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/);
  assert.ok(jump);
  assert.match(jump[0], /loadDirectionPage\("desc"/);
  assert.doesNotMatch(jump[0], /while\s*\(/);
});

test("收藏和主播昵称变更会使主播历史事件结果缓存失效", () => {
  const source = read("src/components/ReviewPanel.tsx");
  assert.match(source, /ownerEventDataRevision/);
  assert.match(source, /setOwnerEventDataRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(source, /ownerEventDataRevision,[\s\S]*?managementRevision/);
});

test("返回主播场次页时，在异步列表加载完成后再恢复外层滚动位置", () => {
  const source = read("src/components/ReviewPanel.tsx");
  assert.match(source, /sessionsLoadedRouteKey/);
  assert.match(source, /route\.level === "owner"[\s\S]*ownerState\.mode === "sessions"[\s\S]*sessionsLoadedRouteKey !== routeKey/);
  assert.match(source, /setSessionsLoadedRouteKey\(routeKey\)/);
});

test("主播事件更多条件以固定浮层打开，不占用结果时间线布局空间", () => {
  const source = read("src/components/ReviewOwnerEventFilters.tsx");
  const popover = read("src/components/ReviewFilterPopover.tsx");
  assert.match(source, /<ReviewFilterPopover open=\{!collapsed && moreConditionsOpen\}/);
  assert.match(popover, /PopoverPrimitive\.Portal/);
  assert.match(popover, /review-filter-advanced-panel/);
});
