import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.setDefaultTimeout(20000);
const errors = [];
const refinements = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  let id = 0;
  const requests = new Map(),
    read = new Set();
  const originalNow = Date.now;
  let offset = 0;
  Date.now = () => originalNow() + offset;
  window.advanceSendingClock = (ms) => (offset += ms);
  window.sent = [];
  window.roomInfoRequests = 0;
  window.releaseRoomWarmup = undefined;
  window.requestCounts = { nav: 0, emoticons: 0 };
  window.navCompleted = 0;
  window.preparationRefreshTimers = [];
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (delay > 180_000 && delay < 300_000)
      window.preparationRefreshTimers.push({ createdAt: Date.now(), delay });
    return nativeSetTimeout(callback, delay, ...args);
  };
  window.worn = [];
  window.medalId = 11;
  window.medalPagination = false;
  window.medalPageRequests = 0;
  window.navCode = 0;
  window.navDelay = 350;
  window.emoticonsLocked = false;
  window.sendResult = { code: 0, message: "", msg: "" };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    transformCallback: () => 1,
    unregisterCallback() {},
    invoke: async (cmd, args = {}) => {
      if (cmd === "prepare_live_http") {
        const request = args.request;
        const rid = ++id;
        requests.set(rid, {
          method: request.kind === "send" ? "POST" : "GET",
          url: request.kind === "send"
            ? `https://api.live.bilibili.com/msg/send?${request.query}`
            : `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByUser?room_id=${request.roomId}`,
          headers: Object.entries(request.headers),
          data: request.body,
        });
        return rid;
      }
      if (cmd === "cancel_live_http") { requests.delete(args.rid); return; }
      if (cmd === "execute_live_http") {
        const q = requests.get(args.rid);
        if (!q) throw new Error("cancelled");
        if (q.url.includes("getInfoByUser") && ++window.roomInfoRequests === 1)
          await new Promise(resolve => { window.releaseRoomWarmup = resolve; });
        if (q.method === "POST") window.sent.push(q);
        const bytes = await window.__TAURI_INTERNALS__.invoke("plugin:http|fetch_read_body", args);
        return { status: 200, body: new TextDecoder().decode(new Uint8Array(bytes.slice(0, -1))) };
      }
      if (cmd === "plugin:http|fetch") {
        const n = ++id;
        requests.set(n, args.clientConfig);
        if (args.clientConfig.url.includes("/nav")) window.requestCounts.nav++;
        if (args.clientConfig.url.includes("GetEmoticons"))
          window.requestCounts.emoticons++;
        if (args.clientConfig.method === "POST") {
          if (args.clientConfig.url.includes("/fansMedal/wear")) {
            window.worn.push(args.clientConfig);
            window.medalId = Number(
              new URLSearchParams(
                new TextDecoder().decode(
                  new Uint8Array(args.clientConfig.data),
                ),
              ).get("medal_id"),
            );
          } else window.sent.push(args.clientConfig);
        }
        return n;
      }
      if (cmd === "plugin:http|fetch_send") {
        const q = requests.get(args.rid);
        if (q.url.includes("/nav") && window.navDelay)
          await new Promise((r) => setTimeout(r, window.navDelay));
        return {
          rid: args.rid,
          status: 200,
          statusText: "OK",
          url: q.url,
          headers: [],
        };
      }
      if (cmd === "plugin:http|fetch_read_body") {
        if (read.has(args.rid)) return [1];
        read.add(args.rid);
        const q = requests.get(args.rid);
        let body = q.url.includes("/finger/spi")
          ? { code: 0, data: { b_3: "device3", b_4: "device4" } }
          : q.url.includes("getInfoByUser")
            ? {
                code: 0,
                data: {
                  property: { danmu: { length: 80 } },
                  medal: {
                    is_weared: true,
                    curr_weared_v2: {
                      name: window.medalId === 11 ? "紫色" : "蓝色",
                      level: window.medalId === 11 ? 9 : 3,
                      is_light: window.medalId === 11 ? 1 : 0,
                    },
                  },
                },
              }
            : q.url.includes("/fansMedal/panel")
              ? {
                  code: 0,
                  data: {
                    total_number: 2,
                    list: [
                      {
                        medal: {
                          medal_id: 11,
                          medal_name: "紫色",
                          level: 9,
                          is_lighted: 1,
                          wearing_status: window.medalId === 11 ? 1 : 0,
                        },
                        anchor_info: { nick_name: "主播甲" },
                      },
                      {
                        medal: {
                          medal_id: 12,
                          medal_name: "蓝色",
                          level: 3,
                          is_lighted: 0,
                          wearing_status: window.medalId === 12 ? 1 : 0,
                        },
                        anchor_info: { nick_name: "主播乙" },
                      },
                    ],
                  },
                }
              : q.url.includes("/nav")
                ? {
                    code: window.navCode,
                    data: {
                      isLogin: true,
                      mid: 1,
                      wbi_img: {
                        img_url:
                          "https://x/abcdefghijklmnopqrstuvwxyz123456.png",
                        sub_url:
                          "https://x/abcdefghijklmnopqrstuvwxyz123456.png",
                      },
                    },
                  }
                : q.url.includes("GetEmoticons")
                  ? {
                      code: 0,
                      data: {
                        data: [
                          {
                            pkg_id: 1,
                            pkg_type: 3,
                            pkg_perm: 0,
                            pkg_name: "文字表情",
                            emoticons: [
                              {
                                emoji: "[笑]",
                                emoticon_unique: "emoji_1",
                                url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                                perm: window.emoticonsLocked ? 0 : 1,
                              },
                            ],
                          },
                          {
                            pkg_id: 2,
                            pkg_type: 1,
                            pkg_name: "大表情",
                            emoticons: [
                              {
                                emoji: "大笑",
                                emoticon_unique: "official_1",
                                url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                                perm: window.emoticonsLocked ? 0 : 1,
                              },
                              {
                                emoji: "未解锁",
                                emoticon_unique: "official_2",
                                url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                                perm: 0,
                                unlock_show_text: "需要粉丝牌",
                              },
                            ],
                          },
                        ],
                      },
                    }
                  : window.sendResult;
        if (q.url.includes("GetEmoticons")) {
          body.data.data[1].pkg_type = 2;
          body.data.data.push({
            pkg_id: 3,
            pkg_type: 1,
            pkg_name: "通用长条",
            emoticons: [
              {
                emoji: "长条",
                emoticon_unique: "official_3",
                width: 200,
                height: 60,
                url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                perm: 1,
              },
            ],
          });
        }
        if (q.url.includes("/fansMedal/panel") && body.code === 0) {
          body.data.special_list = body.data.list.filter(
            (item) => item.medal.wearing_status === 1,
          );
          body.data.list = body.data.list.filter(
            (item) => item.medal.wearing_status !== 1,
          );
        }
        if (q.url.includes("/fansMedal/panel") && window.medalPagination) {
          if (new URL(q.url).searchParams.get("page") === "2") {
            window.medalPageRequests++;
            body =
              window.medalPageRequests === 1
                ? { code: -500 }
                : {
                    code: 0,
                    data: {
                      total_number: 3,
                      list: [
                        {
                          medal: {
                            medal_id: 13,
                            medal_name: "第三个",
                            level: 1,
                            is_lighted: 0,
                            wearing_status: 0,
                          },
                        },
                      ],
                    },
                  };
          } else {
            body.data.total_number = 3;
            body.data.page_info = { has_more: true, next_page: 2 };
          }
        }
        if (q.url.includes("/nav")) {
          window.navCompleted++;
          window.navFinishedAt = Date.now();
        }
        return [...new TextEncoder().encode(JSON.stringify(body)), 0];
      }
      if (cmd === "plugin:store|load") return 100;
      if (cmd === "plugin:store|get") return [null, false];
      if (cmd === "plugin:store|entries") return [];
      if (cmd === "plugin:event|listen") return 1;
      return null;
    },
  };
});
try {
  await page.goto("http://127.0.0.1:1437/tests/fixtures/danmakuComposer.html", {
    waitUntil: "commit",
  });
  await page.waitForFunction(() => !!window.releaseRoomWarmup);
  assert.equal(await page.getByRole("button", { name: "发送弹幕", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  const field = page.getByRole("textbox", { name: "弹幕内容" });
  await field.waitFor();
  assert.equal(await page.evaluate(() => window.roomInfoRequests), 1);
  await page.evaluate(() => window.releaseRoomWarmup());
  const read = () =>
    page.evaluate(
      () =>
        window.composer.getState().drafts[window.composer.getState().context]
          ?.text ?? "",
    );
  assert.equal(
    await page.locator("label").filter({ hasText: "弹幕内容" }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "表情", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page
    .getByRole("button", { name: "粉丝牌", exact: true })
    .locator(".fan-medal")
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByText("发送账号", { exact: true })
      .count(),
    0,
  );
  assert(
    await page
      .getByRole("button", { name: "粉丝牌", exact: true })
      .evaluate(
        (button) =>
          button.parentElement.querySelector('[title="测试主播"]') !== null,
      ),
  );
  await page.waitForFunction(() => window.navCompleted >= 1, null, {
    timeout: 1500,
  });
  const readyCounts = await page.evaluate(() => ({ ...window.requestCounts }));
  assert.equal(readyCounts.nav, 1, "连接和打开输入框应共用预备请求");
  assert(
    await page.evaluate(() =>
      window.preparationRefreshTimers.some(
        (t) =>
          Math.abs(t.createdAt + t.delay - window.navFinishedAt - 240_000) <
          1500,
      ),
    ),
    "应在实际准备完成四分钟后刷新，预留完整一分钟",
  );

  await field.fill("你好\n世界");
  await field.evaluate((e) =>
    e.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal(await page.evaluate(() => window.sent.length), 0);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  assert.equal(await read(), "");
  assert.equal(
    await page.evaluate(() => window.requestCounts.nav),
    readyCounts.nav,
    "就绪后文字发送不得再查登录",
  );
  const first = await page.evaluate(() => window.sent[0]);
  assert.match(
    first.headers.find(([k]) => k.toLowerCase() === "content-type")[1],
    /multipart\/form-data; boundary=/,
  );
  assert.match(
    new TextDecoder().decode(new Uint8Array(first.data)),
    /你好 世界/,
  );
  assert.match(
    first.headers.find(([k]) => k.toLowerCase() === "cookie")[1],
    /buvid3=device3/,
  );
  await field.fill("草稿");
  await field.press("End");
  await page.getByRole("button", { name: "表情", exact: true }).click();
  const tab = page.getByRole("tab", { name: "文字表情", exact: true });
  await tab.waitFor();
  const wheelCheck = await page.getByRole("tablist").evaluate((el) => {
    el.style.maxWidth = "32px";
    el.scrollLeft = 0;
    const event = new WheelEvent("wheel", {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    const moved = el.scrollLeft > 0 && event.defaultPrevented;
    el.scrollLeft = el.scrollWidth;
    const edge = new WheelEvent("wheel", {
      deltaY: 80,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(edge);
    const released = !edge.defaultPrevented;
    el.style.maxWidth = "";
    el.scrollLeft = 0;
    return { moved, released };
  });
  assert.deepEqual(wheelCheck, { moved: true, released: true });

  assert.equal((await tab.innerText()).trim(), "");
  await page.getByRole("button", { name: "[笑]", exact: true }).click();
  assert.equal(await read(), "草稿[笑]");
  assert.equal(await field.locator("img").count(), 1);
  assert.equal(
    (
      await page
        .getByRole("button", { name: "[笑]", exact: true })
        .boundingBox()
    ).height,
    32,
  );
  assert(!(await field.innerText().then((t) => t.includes("[笑]"))));
  await page.getByText("占用 8 / 80", { exact: true }).waitFor();
  await field.press("End");
  await field.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "[笑]");
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
    );
  });
  if ((await field.locator("img").count()) !== 2)
    refinements.push("粘贴已知表情必须保留图片");
  await field.press("Control+z");
  if ((await read()) !== "草稿[笑]") refinements.push("撤销应撤回表情粘贴");
  await field.fill("草稿");
  await field.press("End");
  await page.getByRole("button", { name: "[笑]", exact: true }).click();
  await field.press("Backspace");
  assert.equal(await read(), "草稿");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "表情", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.keyboard.press("Escape");
  await page.locator(".event-row-with-menu").hover();
  await page.getByRole("button", { name: "回复该用户", exact: true }).click();
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.getByRole("tab", { name: "通用长条", exact: true }).click();
  assert.equal(
    (
      await page
        .getByRole("button", { name: "长条", exact: true })
        .boundingBox()
    ).height,
    28,
  );
  await page.getByRole("tab", { name: "大表情", exact: true }).click();
  assert.equal(
    (
      await page
        .getByRole("button", { name: "大笑", exact: true })
        .boundingBox()
    ).height,
    48,
  );
  assert(
    await page
      .getByRole("button", { name: "未解锁", exact: true })
      .isDisabled(),
  );
  const beforeLarge = await page.evaluate(() => ({ ...window.requestCounts }));
  await page.getByRole("button", { name: "大笑", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => ({ ...window.requestCounts })),
    beforeLarge,
    "已加载的大表情应直接提交",
  );

  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  assert.equal(await page.evaluate(() => window.sent.length), 2);
  assert.equal(await read(), "草稿");
  assert.equal(
    await page
      .getByRole("button", { name: "取消回复并选择表情", exact: true })
      .count(),
    0,
  );
  const emote = new TextDecoder().decode(
    new Uint8Array(await page.evaluate(() => window.sent[1].data)),
  );
  assert.match(emote, /official_1/);
  assert(!emote.includes('name="reply_mid"'));
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  const reply = new TextDecoder().decode(
    new Uint8Array(await page.evaluate(() => window.sent[2].data)),
  );
  assert.match(reply, /name="reply_mid"\r\n\r\n456/);
  await field.fill("保留文字");
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  await page.getByRole("button", { name: /蓝色 3/ }).click();
  await page.waitForFunction(() => window.worn.length === 1);
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="粉丝牌"]')
        ?.getAttribute("aria-expanded") === "false",
  );
  assert.equal(await read(), "保留文字");
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  assert(
    (await page
      .getByRole("button", { name: /蓝色 3/ })
      .getAttribute("aria-pressed")) === "true",
  );
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  await page.evaluate(() => {
    window.medalPagination = true;
    window.medalPageRequests = 0;
  });
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  await page.getByRole("button", { name: "刷新粉丝牌", exact: true }).click();
  await page.getByRole("button", { name: "加载更多", exact: true }).click();
  await page
    .getByText("粉丝牌没能加载，请刷新重试。", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "加载更多", exact: true }).click();
  await page.waitForTimeout(200);
  if ((await page.evaluate(() => window.medalPageRequests)) !== 2)
    refinements.push("翻页失败应能在原页重试");
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  await page.evaluate(() => {
    window.medalPagination = false;
    window.connection.setState({
      state: { status: "connected", roomId: 456, anchorName: "房间乙" },
    });
  });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "粉丝牌", exact: true }).click();
  await page.evaluate(() => (window.emoticonsLocked = true));
  await page.getByRole("button", { name: /紫色 9/ }).click();
  await page.waitForFunction(() => window.worn.length === 2);
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="粉丝牌"]')
        ?.getAttribute("aria-expanded") === "false",
  );
  await page.evaluate(() =>
    window.connection.setState({
      state: { status: "connected", roomId: 123, anchorName: "测试主播" },
    }),
  );
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.getByRole("button", { name: "[笑]", exact: true }).waitFor();
  if (
    !(await page
      .getByRole("button", { name: "[笑]", exact: true })
      .isDisabled())
  )
    refinements.push("换牌应刷新该账号所有房间权限");
  await page.evaluate(() => (window.emoticonsLocked = false));
  await page.getByRole("button", { name: "刷新表情", exact: true }).click();
  await page.getByRole("button", { name: "[笑]", exact: true }).waitFor();
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.evaluate(
    () => (window.sendResult = { code: 0, msg: "f", message: "f" }),
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page
    .getByText("这条弹幕没发出去，请修改内容后再试。", { exact: true })
    .waitFor();
  assert.equal(await read(), "保留文字");
  await page.getByRole("button", { name: "表情", exact: true }).click();
  for (const scale of [1, 1.25, 1.5]) {
    await page.setViewportSize({
      width: Math.round(1000 / scale),
      height: Math.round(750 / scale),
    });
    const r = await page.getByRole("dialog").boundingBox();
    assert(r.x >= 0 && r.x + r.width <= Math.round(1000 / scale) + 1);
  }
  await page.screenshot({
    path: "C:/Users/Orange/AppData/Local/Temp/danmaku-composer-light.png",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "C:/Users/Orange/AppData/Local/Temp/danmaku-composer-dark.png",
  });
  for (const [lang, label] of [
    ["en", "Send"],
    ["ja", "送信"],
    ["zh-Hant", "發送"],
  ]) {
    await page.evaluate((l) => window.language(l), lang);
    await page.getByRole("button", { name: label, exact: true }).waitFor();
    assert.equal(await read(), "保留文字");
  }
  await page.evaluate(() => window.language("zh-CN"));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const beforeExpiry = await page.evaluate(() => window.navCompleted);
  await page.evaluate(() => window.advanceSendingClock(6 * 60_000));
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  await page.waitForFunction((n) => window.navCompleted > n, beforeExpiry);
  await page.evaluate(() => {
    window.language("zh-CN");
    window.sendResult = { code: -101 };
  });
  const before = await page.evaluate(() => window.sent.length);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("请重新登录后再发。", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.sent.length), before + 1);
  await page.evaluate(() => {
    window.navCode = 0;
    window.navDelay = 300;
    window.sendResult = { code: 0, message: "", msg: "" };
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.evaluate(() =>
    window.connection.setState({
      state: { status: "connected", roomId: 999, anchorName: "新房间" },
    }),
  );
  await page.waitForFunction(() => !window.composer.getState().busy, null, {
    timeout: 150,
  });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.sent.length), before + 1);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.evaluate(() => {
    window.navDelay = 0;
    const old = window.session.getState().session;
    window.session.setState({
      session: {
        ...old,
        mid: "2",
        savedAt: 2,
        cookie: "SESSDATA=other;bili_jct=other",
      },
    });
  });
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  await page.getByRole("textbox", { name: "弹幕内容" }).fill("新账号草稿");
  const beforeOther = await page.evaluate(() => window.sent.length);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("请重新登录后再发。", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.sent.length),
    beforeOther,
    "新账号不能复用旧账号的准备结果",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(refinements, []);
  console.log(
    "图标分类、设备信息、小表情混排与字数、大表情即时发送及回复草稿、粉丝牌切换、IME、缩放与四语言通过",
  );
} finally {
  await browser.close();
}
