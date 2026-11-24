import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = fileURLToPath(new URL("../", import.meta.url)),
  args = process.argv.slice(2),
  arg = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--input") || !args.includes("--output"))
  throw Error("请指定 --input 候选JSON 和 --output 输出目录");
const output = path.resolve(arg("--output"));
await fs.mkdir(path.join(output, "assets"), { recursive: true });
const input = JSON.parse(await fs.readFile(arg("--input"), "utf8"));
const recent = Array.isArray(input.groups);
const candidates = recent
  ? Object.fromEntries(
      input.groups.map((g) => [
        g.key,
        g.choices.map((c) => ({ ...c, owner: c.streamer })),
      ]),
    )
  : input;
const materials = JSON.parse(
  await fs.readFile(
    path.join(root, "src/preview/nativePreviewSamples.json"),
    "utf8",
  ),
);
const owners = new Map(
  Object.values(candidates)
    .flat()
    .map((r) => [r.event.roomId, r.owner]),
);
const supplement = (key, type, test = () => true) => {
  const rows = materials.samples
    .filter((s) => s.event.msgType === type && test(s.event))
    .map((s) => ({
      event: s.event,
      source: s.source,
      owner: owners.get(s.event.roomId) || String(s.event.roomId),
    }));
  if (!candidates[key]?.length) candidates[key] = rows;
};
if (!recent) {
  supplement("chat:deleted", 0, (e) => e.danmuDeleted);
  supplement("pocket:2", 6, (e) => e.pocket?.rpType === 2);
  supplement("system:24", 24);
}
const defs = [];
if (!recent) {
  const slot = (key, label, note) => defs.push({ key, label, note });
  for (const [k, label] of [
    ["normal", "普通用户"],
    ["captain", "舰长"],
    ["admiral", "提督"],
    ["governor", "总督"],
    ["admin", "房管"],
    ["anchor", "主播"],
  ])
    slot("identity:" + k, "弹幕 · " + label);
  slot("identity:admin-guard", "弹幕 · 房管与大航海叠加");
  slot(
    "identity:anchor-guard",
    "弹幕 · 主播与大航海叠加",
    "当前只有一位主播的完整叠加实录；未找到对应已撤回记录，不自动改写状态。",
  );
  slot("chat:deleted", "弹幕 · 已撤回");
  slot("identity:normal", "弹幕 · 短正文");
  for (const [k, label] of [
    ["long", "长正文"],
    ["reply", "回复"],
    ["small-emote", "行内表情"],
    ["big-emote", "大表情"],
    ["banner", "横条表情"],
  ])
    slot("chat:" + k, "弹幕 · " + label);
  for (const [k, l] of [
    ["entry", "进入直播间"],
    ["follow", "关注"],
    ["share", "分享"],
    ["specialFollow", "特别关注"],
    ["mutualFollow", "互相关注"],
    ["like", "点赞"],
  ])
    slot("interaction:" + k, "互动 · " + l);
  candidates["repeat:text"] = candidates["identity:normal"];
  slot(
    "repeat:text",
    "弹幕 · 合并展示用正文",
    "选择用于相同弹幕合并示例的正文。原始记录保持不变，显示次数在整合静态前另行确认。",
  );
  slot("gift:free", "礼物 · 免费");
  const bands = [0, 30, 50, 100, 500, 1000, 2000];
  for (const [i, b] of bands.entries())
    slot(
      "gift:band-" + b,
      `普通礼物 · ${b}${bands[i + 1] ? "—" + bands[i + 1] + "元（不含上限）" : "元及以上"}`,
    );
  for (const [k, l] of [
    ["loss", "亏损"],
    ["even", "持平"],
    ["profit", "盈利"],
  ])
    slot("blind:" + k, "盲盒 · " + l);
  slot(
    "gift:multiple",
    "礼物 · 多数量",
    "这些是实录中的多数量礼物。连击增长过程将在动态预览中验证。",
  );
  for (const [i, b] of bands.entries())
    slot(
      "sc:band-" + b,
      `醒目留言 · ${b}${bands[i + 1] ? "—" + bands[i + 1] + "元（不含上限）" : "元及以上"}`,
    );
  slot("sc:deleted", "醒目留言 · 已撤回");
  for (const [k, l] of [
    ["1", "舰长"],
    ["2", "提督"],
    ["3", "总督"],
    ["honor", "大航海成就"],
  ])
    slot("guard:" + k, "大航海 · " + l);
  slot("lottery:start", "天选 · 开始");
  slot("lottery:result", "天选 · 开奖");
  for (const [k, l] of [
    ["0", "普通红包 A"],
    ["1", "普通红包 B"],
    ["2", "大航海红包"],
    ["3", "电池红包"],
    ["result", "红包开奖"],
  ])
    slot("pocket:" + k, "红包 · " + l);
  for (const [k, l] of [
    [22, "直播开始"],
    [23, "直播结束"],
    [18, "用户禁言"],
    [19, "全员禁言"],
    [20, "房管变更"],
    [21, "房间信息变更"],
    [24, "直播警告"],
    [25, "直播切断"],
  ])
    slot("system:" + k, "系统 · " + l);
} else {
  for (const group of input.groups)
    defs.push({
      key: group.key,
      label: group.category + " · " + group.title,
      note:
        `实录中符合条件 ${group.observedCount} 条 · 提供 ${group.choices.length} 个候选。` +
        (group.note || ""),
    });
}
const cache = new Map();
let previous = [];
try {
  previous = JSON.parse(
    await fs.readFile(path.join(output, "候选来源.json"), "utf8"),
  ).assets;
} catch {}
const previousAssets = new Map(
  previous.filter((a) => a.path).map((a) => [a.source, a]),
);
let sequence = Math.max(
  0,
  ...previous
    .filter((a) => a.path)
    .map((a) => Number(a.path.match(/media-(\d+)/)?.[1]) || 0),
);
const assets = [];
async function asset(src, localBase) {
  if (!src || src.startsWith("data:")) return src;
  const cacheKey = localBase ? path.resolve(localBase, src) : src;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const task = (async () => {
    const saved = previousAssets.get(src);
    if (saved) {
      try {
        await fs.access(path.join(output, saved.path));
        assets.push(saved);
        return saved.path;
      } catch {}
    }
    let bytes, type;
    let local;
    if (localBase) local = path.resolve(localBase, src.replace(/^\//, ""));
    else if (src.startsWith("/src/")) local = path.join(root, src);
    else if (src.startsWith("/")) local = path.join(root, "public", src);
    else if (!/^https?:/.test(src)) return src;
    if (/^https?:/.test(src)) {
      const known = materials.resources.find((r) => r.url === src);
      if (known) local = path.join(root, "public", known.path);
    }
    try {
      if (local) bytes = await fs.readFile(local);
      else {
        const r = await fetch(src);
        if (!r.ok) throw Error("HTTP " + r.status);
        type = r.headers.get("content-type");
        bytes = Buffer.from(await r.arrayBuffer());
      }
      const ext =
        path.extname(local || new URL(src).pathname).replace(/[^.\w]/g, "") ||
        (type?.includes("webp") ? ".webp" : ".png");
      const name = "assets/media-" + String(++sequence).padStart(4, "0") + ext;
      await fs.writeFile(path.join(output, name), bytes);
      assets.push({ source: src, path: name, bytes: bytes.length });
      return name;
    } catch (error) {
      assets.push({ source: src, error: String(error) });
      return src;
    }
  })();
  cache.set(cacheKey, task);
  return task;
}
async function rewrite(text, regex, replace) {
  const matches = [...text.matchAll(regex)];
  const values = await Promise.all(matches.map(replace));
  let result = "",
    last = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    result += text.slice(last, m.index) + values[i];
    last = m.index + m[0].length;
  }
  return result + text.slice(last);
}
const vite = await createServer({
  root,
  configFile: false,
  cacheDir: path.join(tmpdir(), "native-gallery-vite"),
  esbuild: { jsx: "automatic" },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null },
  logLevel: "silent",
});
try {
  const { EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx");
  const { createBuiltinNativeTheme } = await vite.ssrLoadModule(
    "/src/themes/nativeBuiltinThemes.ts",
  );
  const { composeNativeThemeCss } = await vite.ssrLoadModule(
    "/src/themes/nativeThemeCascade.ts",
  );
  const { createEventAreaConfigCss } = await vite.ssrLoadModule(
    "/src/eventAreaStyleConfig.ts",
  );
  const { DEFAULT_EVENT_DISPLAY_PREFERENCES } = await vite.ssrLoadModule(
    "/src/eventDisplaySettings.ts",
  );
  const theme = createBuiltinNativeTheme(args.includes("--theme") ? arg("--theme") : "native-default"),
    prefs = {
      ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
      showTimestamp: false,
      showAvatarFrame: true,
      showHonorLevel: true,
      showCurrentRank: true,
    };
  const index = await fs.readFile(path.join(root, "dist/index.html"), "utf8");
  const cssPath = index.match(/href="([^\"]+\.css)"/)?.[1];
  let css = await fs.readFile(path.join(root, "dist", cssPath), "utf8");
  css = await rewrite(css, /url\(["']?([^\)"']+)["']?\)/g, async (m) => {
    const src = m[1];
    if (src.startsWith("data:") || src.startsWith("#") || src.startsWith("%23"))
      return m[0];
    const source = src.startsWith("/")
      ? path.join(root, "dist", src)
      : path.resolve(path.dirname(path.join(root, "dist", cssPath)), src);
    return (
      'url("' +
      (await asset(path.basename(source), path.dirname(source))) +
      '")'
    );
  });
  css +=
    "\n" +
    composeNativeThemeCss(theme) +
    "\n" +
    createEventAreaConfigCss("gallery", {
      settings: theme.settings,
      layout: "live",
      fontSize: 16,
      padding: 8,
      spacing: 6,
    });
  const groups = [];
  const manifests = [];
  for (const [gi, def] of defs.entries()) {
    let rows = candidates[def.key] || [];
    if (def.key === "identity:admin")
      rows = rows.filter((r) => !r.event.user?.guardLevel);
    if (def.key === "identity:anchor")
      rows = rows.filter((r) => !r.event.user?.guardLevel);
    const options = [];
    for (const [oi, row] of rows.entries()) {
      const e =
          row.previewEvent ||
          (row.derived?.kind === "sameDanmuSequence"
            ? { ...row.event, danmuRepeatCount: row.derived.count }
            : row.event),
        id =
          row.id ||
          `G${String(gi + 1).padStart(2, "0")}-${String(oi + 1).padStart(2, "0")}`;
      let html = renderToStaticMarkup(
        React.createElement(EventRow, {
          ev: e,
          liveLayout: true,
          showTime: false,
          animateOnMount: false,
          displayPreferences: prefs,
          eventStyleSettings: theme.settings,
        }),
      );
      html = await rewrite(
        html,
        /src="([^\"]+)"/g,
        async (m) => 'src="' + (await asset(m[1].replace(/&amp;/g, "&"))) + '"',
      );
      const u = e.user,
        g = e.gift,
        sc = e.sc,
        lot = e.lottery;
      const identity =
        [
          u?.isAnchor ? "主播" : "",
          u?.isAdmin ? "房管" : "",
          u?.guardLevel ? ["", "舰长", "提督", "总督"][u.guardLevel] : "",
        ]
          .filter(Boolean)
          .join("＋") || "普通用户";
      const text = e.text || sc?.message || lot?.awardName || g?.name || "";
      const value = g?.blindGiftName
        ? (g.blindHitPriceRmb ?? g.priceRmb) * g.count
        : g?.totalRmb;
      const amount = g
        ? `${g.name} ×${g.count} · 价值 ¥${value ?? "未知"}`
        : sc
          ? "醒目留言 ¥" + sc.price
          : e.guard
            ? "大航海 ¥" + (e.guard.priceRmb ?? "未知")
            : "";
      options.push({
        id,
        name: u?.uname || row.owner || "系统事件",
        owner: row.owner || String(e.roomId),
        identity: row.identity || identity,
        notes: [
          ...(row.notes || []),
          ...(row.derived?.kind === "sameDanmuSequence"
            ? ["按实录连续三条相同弹幕展示合并效果，原始记录未改写。"]
            : []),
        ],
        source: row.source,
        room: e.roomId,
        time: new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(e.ts),
        description: row.description || text,
        amount,
        html:
          '<div class="event-area" data-event-style-scope="gallery">' +
          html +
          "</div>",
      });
      manifests.push({
        id,
        group: def.key,
        label: def.label,
        source: row.source,
        event: row.event,
        previewEvent: row.previewEvent,
        derived: row.derived,
        notes: row.notes,
      });
    }
    groups.push({
      ...def,
      key: recent ? def.key : "slot-" + gi,
      sourceGroup: def.key,
      options,
    });
  }
  const data = {
    id: recent
      ? "native-event-candidates-20261122-v1"
      : "native-static-candidates-20261116-v2",
    groups,
    selection: input.selection,
    description: recent
      ? `11月18—21日实录与历史补充 · ${groups.length}项展示用途、${manifests.length}个候选。已载入确认的15项选择；历史素材单独标注。`
      : undefined,
  };
  let html = await fs.readFile(
    path.join(root, "scripts/templates/native-candidate-gallery.html"),
    "utf8",
  );
  html = html
    .replace("__NATIVE_CSS__", css)
    .replace("__GALLERY_DATA__", JSON.stringify(data).replace(/</g, "\\u003c"));
  await fs.writeFile(path.join(output, "候选画册.html"), html);
  await fs.writeFile(
    path.join(output, "候选来源.json"),
    JSON.stringify({ gallery: data.id, options: manifests, assets }, null, 2),
  );
  console.log(
    JSON.stringify({
      groups: groups.length,
      options: manifests.length,
      assets: assets.length,
      failedAssets: assets.filter((a) => a.error).length,
      output,
    }),
  );
} finally {
  await vite.close();
}
