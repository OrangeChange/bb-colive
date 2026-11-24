import test from "node:test";
import assert from "node:assert/strict";
import { mergeGiftInto } from "../src/events/giftMerge.ts";
import { summarizeGiftEvents } from "../src/components/eventSummary.ts";
import { projectArchiveEvents } from "../src/archive/archiveProjection.ts";
import { buildArchiveDataBundle } from "../src/archive/archiveDataExport.ts";
import { getEventBookmarkKey, getEventMarkKey } from "../src/events/eventIdentity.ts";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function loadFormats() {
  try {
    return await import("../src/archive/archiveDataExportFormats.ts");
  } catch (error) {
    assert.fail(`无法加载导出格式模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadZip() {
  return import("fflate");
}

const common = {
  "场次ID": "session-1",
  "事件时间": "2026-09-26 12:00:01",
  "用户UID": "90071992547409931234",
  "用户名": "含,逗号\"和\n换行",
  "粉丝牌": null,
  "荣耀等级": 42,
  "大航海身份": null,
};

const rows = {
  danmaku: [{ ...common, "内容": "=SUM(A1) @回复" }],
  interaction: [],
  gift: [{ ...common, "礼物类型": "普通礼物", "礼物名称": "礼物", "数量": 2, "礼物价值": 20, "实际支付金额": 18, "盲盒名称": null }],
  superchat: [],
  guard: [],
};

const bundle = {
  scope: { kind: "session", sessionId: "session-1" },
  sessions: [{ sessionId: "session-1", ownerId: "owner-1", ownerName: "主播甲", roomId: 101, title: "测试", startedAt: 1000, endedAt: 2000, status: "ended", quality: "incomplete", durationMs: 3_934_425, liveKey: "internal-live-key" }],
  items: [],
  rowsByCategory: rows,
  summary: [],
};

test('Excel summary与JSON分别保留直播、记录和质量状态及原因', async () => {
  const { serializeArchiveDataExcel, serializeArchiveDataAiJson } = await loadFormats();
  const { unzipSync } = await loadZip();
  const sessions = [{ ...bundle.sessions[0], status: 'unclean', quality: 'in-progress', recordingStatus: 'reconnecting', stopReason: 'connection-error', qualityReason: 'previous-runtime', qualityReasons: [] }];
  const stats = Object.fromEntries(['danmaku', 'interaction', 'normalGift', 'blindGift', 'redPocket', 'superchat', 'guard', 'captain', 'admiral', 'viceroy'].map(k => [k, { eventCount: 0, userCount: 0, quantity: null, value: null, amount: null }]));
  const value = { ...bundle, sessions, summary: [{ session: sessions[0], stats, exportedEventCount: 0 }] };
  const json = JSON.parse(new TextDecoder().decode(serializeArchiveDataAiJson(value)));
  for (const exported of [json.sessions[0], json.summary[0].session]) {
    assert.equal(exported.recordingStatus, 'reconnecting');
    assert.equal(exported.stopReason, 'connection-error');
    assert.deepEqual(exported.qualityReasons, []);
    assert.equal(exported.qualityReason, 'previous-runtime');
    assert.equal(exported.statusLabel, '状态未知');
    assert.equal(exported.recordingStatusLabel, '重连中');
    assert.equal(exported.qualityLabel, '待确认');
  }
  const sheet = new TextDecoder().decode(unzipSync(serializeArchiveDataExcel(value))['xl/worksheets/sheet1.xml']);
  for (const text of ['直播状态', '记录状态', '记录质量', '状态未知', '重连中', '待确认']) assert.ok(sheet.includes(text), text);
  assert.ok(!sheet.includes('未正常结束'));
});

test("CSV使用BOM、CRLF和RFC4180转义，并保留原始文本", async () => {
  const { serializeArchiveDataCsv } = await loadFormats();
  const bytes = serializeArchiveDataCsv("danmaku", [
    ...rows.danmaku,
    { ...common, "用户名": "-秋莫-", "内容": "+1" },
  ]);
  const text = new TextDecoder().decode(bytes);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(text, /\r\n/);
  assert.match(text, /"含,逗号""和\n换行"/);
  assert.match(text, /=SUM\(A1\) @回复/);
  assert.match(text, /,-秋莫-,,42,,\+1\r\n/);
});

test("AI JSON保留四个根字段并使用UTF-8 JSON对象", async () => {
  const { serializeArchiveDataAiJson } = await loadFormats();
  const parsed = JSON.parse(new TextDecoder().decode(serializeArchiveDataAiJson(bundle)));
  assert.deepEqual(Object.keys(parsed), ["scope", "sessions", "summary", "events"]);
  assert.equal(parsed.scope.kind, bundle.scope.kind);
  assert.equal(parsed.scope.sessionId, bundle.scope.sessionId);
  assert.match(parsed.scope.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(parsed.sessions[0].sessionId, "session-1");
  assert.equal(parsed.sessions[0].ownerName, "主播甲");
  assert.equal(parsed.sessions[0].exportedEventCount, 0);
  assert.equal("liveKey" in parsed.sessions[0], false);
});

test("Excel是可解压的标准工作簿并包含六个指定工作表", async () => {
  const { serializeArchiveDataExcel } = await loadFormats();
  const { unzipSync } = await loadZip();
  const files = unzipSync(serializeArchiveDataExcel(bundle));
  const workbook = new TextDecoder().decode(files["xl/workbook.xml"]);
  assert.deepEqual(
    [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]),
    ["summary", "danmaku", "interaction", "gift", "superchat", "guard"],
  );
  const danmakuSheet = new TextDecoder().decode(files["xl/worksheets/sheet2.xml"]);
  assert.match(danmakuSheet, /90071992547409931234/);
  assert.match(danmakuSheet, /含,逗号/);
});

test("Excel summary使用可读的场次信息和导出事件数", async () => {
  const { serializeArchiveDataExcel } = await loadFormats();
  const emptyStat = () => ({ eventCount: 0, uniqueUserCount: 0, quantity: null, value: null, amount: null });
  const stats = Object.fromEntries([
    "danmaku", "interaction", "normalGift", "blindGift", "redPocket", "superchat", "guard", "captain", "admiral", "viceroy",
  ].map((key) => [key, emptyStat()]));
  const summary = [{ session: bundle.sessions[0], stats, exportedEventCount: 12 }];
  const files = await (async () => {
    const { unzipSync } = await loadZip();
    return unzipSync(serializeArchiveDataExcel({ ...bundle, summary }));
  })();
  const summarySheet = new TextDecoder().decode(files["xl/worksheets/sheet1.xml"]);
  assert.match(summarySheet, /主播甲/);
  assert.match(summarySheet, /01:05:34/);
  assert.match(summarySheet, /已结束/);
  assert.match(summarySheet, /不完整/);
  assert.match(summarySheet, /导出事件数/);
  assert.match(summarySheet, />12</);
});

test("多分类CSV ZIP只包含用户选择的分类文件", async () => {
  const { serializeArchiveDataCsv, zipArchiveDataCsv } = await loadFormats();
  const { unzipSync } = await loadZip();
  const zip = zipArchiveDataCsv({
    "danmaku.csv": serializeArchiveDataCsv("danmaku", rows.danmaku),
    "gift.csv": serializeArchiveDataCsv("gift", rows.gift),
  });
  assert.deepEqual(Object.keys(unzipSync(zip)).sort(), ["danmaku.csv", "gift.csv"]);
});

function paymentEvent(id, count, paymentRmb, extra = {}, giftPatch = {}) {
  return {
    id, msgType: 1, roomId: 101, ts: 1000, comboId: "payment-combo",
    user: { uid: "payment-user", uname: "金额测试", guardLevel: 0 },
    gift: { id: 1, name: "小花", count, price: 1000, priceRmb: 1,
      total: count * 1000, totalRmb: count, paymentRmb, coinType: "gold", ...giftPatch },
    ...extra,
  };
}

function readSheet(bytes) {
  const xml = new TextDecoder().decode(bytes);
  return [...xml.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs)].map((row) =>
    [...row[1].matchAll(/<c\b[^>]*?(?:\/>|>(.*?)<\/c>)/gs)].map((cell) => {
      const body = cell[1] ?? "";
      const numeric = body.match(/<v>(.*?)<\/v>/s);
      if (numeric) return Number(numeric[1]);
      return body.match(/<t\b[^>]*>(.*?)<\/t>/s)?.[1] ?? null;
    }));
}

const paymentCases = [
  { name: "可信增量支付相加", events: [paymentEvent("a", 1, 1), paymentEvent("b", 1, 1, { ts: 1100 })], count: 2, value: 2, payment: 2 },
  { name: "可信累计支付替换并接受迟到摘要", events: [paymentEvent("a", 1, 1), paymentEvent("b", 2, 1.5, { ts: 20000, isComboUpdate: true })], count: 2, value: 2, payment: 1.5 },
  { name: "累计数量完整保留增量支付", events: [paymentEvent("a", 1, 1), paymentEvent("b", 1, 1, { ts: 1100 }), paymentEvent("c", 2, undefined, { ts: 1200, isComboUpdate: true })], count: 2, value: 2, payment: 2 },
  { name: "普通连击已有金瓜子累计金额补齐支付", events: [paymentEvent("a", 1, 1), paymentEvent("b", 3, undefined, { ts: 1100, isComboUpdate: true })], count: 3, value: 3, payment: 3 },
  { name: "累计数量超出已知支付覆盖则留空", events: [paymentEvent("a", 1, 1), paymentEvent("b", 3, undefined, { ts: 1100, isComboUpdate: true }, { total: undefined })], count: 3, value: 3, payment: null },
  { name: "新增未知支付使整行支付未知", events: [paymentEvent("a", 1, 1), paymentEvent("b", 1, undefined, { ts: 1100 }), paymentEvent("c", 2, undefined, { ts: 1200, isComboUpdate: true }, { total: undefined })], count: 2, value: 2, payment: null },
  { name: "未知在前也不能用后续已知部分充当总额", events: [paymentEvent("a", 1, undefined), paymentEvent("b", 1, 1, { ts: 1100 })], count: 2, value: 2, payment: null },
  { name: "普通未知支付不由价值推断", events: [paymentEvent("a", 1, undefined), paymentEvent("b", 1, undefined, { ts: 1100 })], count: 2, value: 2, payment: null },
  { name: "免费礼物合并明确为零", events: [paymentEvent("a", 1, undefined, {}, { coinType: "silver", isFree: true, priceRmb: 0, totalRmb: 0 }), paymentEvent("b", 1, undefined, { ts: 1100 }, { coinType: "silver", isFree: true, priceRmb: 0, totalRmb: 0 }), paymentEvent("c", 4, undefined, { ts: 1200, isComboUpdate: true }, { coinType: "silver", isFree: true, priceRmb: 0, totalRmb: 0 })], count: 4, value: 0, payment: 0 },
  { name: "盲盒升级占位行保留真实价值支付", events: [paymentEvent("a", 2, undefined, { isComboUpdate: true }), paymentEvent("b", 2, 10, { ts: 1100 }, { blindGiftName: "幸运盲盒", blindPriceRmb: 5, blindHitPriceRmb: 3, priceRmb: 3, totalRmb: 6 }), paymentEvent("c", 2, undefined, { ts: 1200, isComboUpdate: true })], count: 2, value: 6, payment: 10, blind: true },
  { name: "已完成连击消费迟到增量和摘要重推", events: [paymentEvent("a", 1, 1), paymentEvent("b", 3, 2.5, { ts: 20000, isComboUpdate: true }), paymentEvent("c", 1, 1, { ts: 21000 }), paymentEvent("d", 3, 2.5, { ts: 22000, isComboUpdate: true })], count: 3, value: 3, payment: 2.5 },
  { name: "可信累计支付恢复未知总额", events: [paymentEvent("a", 1, undefined), paymentEvent("b", 2, 1.75, { ts: 1100, isComboUpdate: true })], count: 2, value: 2, payment: 1.75 },
  { name: "零元可信累计支付替换非零金额", events: [paymentEvent("a", 1, 1), paymentEvent("b", 2, 0, { ts: 1100, isComboUpdate: true })], count: 2, value: 2, payment: 0 },
];

for (const sample of paymentCases) {
  test(`合并礼物金额在现场、回看、Excel、CSV、JSON一致：${sample.name}`, async (t) => {
    const { serializeArchiveDataExcel, serializeArchiveDataCsv, serializeArchiveDataAiJson } = await loadFormats();
    const { unzipSync } = await loadZip();
    const original = JSON.stringify(sample.events);
    const live = [];
    for (const event of sample.events) {
      if (!mergeGiftInto(live, event)) live.push(event);
    }
    assert.equal(live.length, 1);
    assert.equal(live[0].gift.count, sample.count);
    assert.equal(live[0].gift.paymentRmb ?? null, sample.payment);
    assert.deepEqual(summarizeGiftEvents(live, [0]), {
      totalRmb: sample.value, blindCount: sample.blind ? 1 : 0, blindProfitRmb: sample.blind ? -4 : 0,
    });
    assert.equal(getEventMarkKey(live[0]), getEventMarkKey(sample.events[0]));
    assert.equal(getEventBookmarkKey(live[0]), getEventBookmarkKey(sample.events[0]));
    const records = sample.events.map((event, ordinal) => ({
      eventKey: `session-1:archive-event:${event.id}`, sessionId: "session-1", roomId: 101,
      ordinal, eventTs: event.ts, primaryCategory: "gift", secondaryCategory: "normal",
      userUid: event.user.uid, userName: event.user.uname, searchText: "小花", sourceId: null,
      payloadJson: JSON.stringify(event), favorited: ordinal === 0,
    }));
    const saved = JSON.stringify(records);
    const filters = { userUid: "payment-user", primaryCategories: ["gift"] };
    const projected = projectArchiveEvents(records, { filters });
    assert.equal(projected.length, 1);
    assert.equal(projected[0].eventKey, records[0].eventKey);
    assert.equal(projected[0].favorited, true);
    assert.equal(projected[0].event.gift.paymentRmb ?? null, sample.payment);
    assert.deepEqual(summarizeGiftEvents(projected.map((row) => row.event), [0]), summarizeGiftEvents(live, [0]));
    const scope = { kind: "session", sessionId: "session-1", filters };
    const actual = { scope, sessions: bundle.sessions, ...buildArchiveDataBundle({ sessions: bundle.sessions, records }, scope, filters) };
    const expected = [sample.count, sample.value, sample.payment];
    const fields = ["数量", "礼物价值", "实际支付金额"];
    const directory = await mkdtemp(join(tmpdir(), "danmu-task-3-export-"));
    t.diagnostic(`导出样例文件：${directory}`);
    await writeFile(join(directory, "gift.json"), serializeArchiveDataAiJson(actual));
    await writeFile(join(directory, "gift.csv"), serializeArchiveDataCsv("gift", actual.rowsByCategory.gift));
    await writeFile(join(directory, "gift.xlsx"), serializeArchiveDataExcel(actual));
    const json = JSON.parse(await readFile(join(directory, "gift.json"), "utf8"));
    assert.equal(json.events.length, 1);
    assert.deepEqual(fields.map((field) => json.events[0][field]), expected);
    const stat = json.summary[0].stats[sample.blind ? "blindGift" : "normalGift"];
    assert.deepEqual([stat.eventCount, stat.quantity, stat.value, stat.amount], [1, ...expected]);
    const csv = (await readFile(join(directory, "gift.csv"), "utf8")).trimEnd().split("\r\n").map((line) => line.split(","));
    assert.equal(csv.length, 2);
    assert.deepEqual(fields.map((field) => {
      const value = csv[1][csv[0].indexOf(field)];
      return value === "" ? null : Number(value);
    }), expected);
    const files = unzipSync(await readFile(join(directory, "gift.xlsx")));
    const excel = readSheet(files["xl/worksheets/sheet4.xml"]);
    assert.equal(excel.length, 2);
    assert.deepEqual(fields.map((field) => excel[1][excel[0].indexOf(field)]), expected);
    const summary = readSheet(files["xl/worksheets/sheet1.xml"]);
    const column = summary[3].indexOf(sample.blind ? "盲盒" : "普通礼物");
    assert.deepEqual([summary[4][column], summary[6][column], summary[7][column], summary[8][column]], [1, ...expected]);
    assert.equal(JSON.stringify(records), saved);
    assert.equal(JSON.stringify(sample.events), original);
  });
}
