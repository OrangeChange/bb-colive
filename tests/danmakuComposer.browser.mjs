import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  let id = 0;
  const requests = new Map(),
    read = new Set();
  window.sent = [];
  window.sendResult = { code: 0, message: "", msg: "" };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    transformCallback: () => 1,
    unregisterCallback() {},
    invoke: async (cmd, args = {}) => {
      if (cmd === "plugin:http|fetch") {
        const n = ++id;
        requests.set(n, args.clientConfig);
        if (args.clientConfig.method === "POST")
          window.sent.push(args.clientConfig);
        return n;
      }
      if (cmd === "plugin:http|fetch_send") {
        const q = requests.get(args.rid);
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
        let body = q.url.includes("/nav")
          ? {
              code: 0,
              data: {
                isLogin: true,
                mid: 1,
                wbi_img: {
                  img_url: "https://x/abcdefghijklmnopqrstuvwxyz123456.png",
                  sub_url: "https://x/abcdefghijklmnopqrstuvwxyz123456.png",
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
                      pkg_name: "文字表情",
                      emoticons: [
                        {
                          emoji: "[笑]",
                          emoticon_unique: "emoji_1",
                          url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                          perm: 1,
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
                          perm: 1,
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
  await page.getByRole("button", { name: "发送弹幕", exact: true }).click();
  const field = page.getByRole("textbox", { name: "弹幕内容" });
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
  assert.equal(await field.inputValue(), "");
  const first = await page.evaluate(() => window.sent[0]);
  assert.match(
    first.headers.find(([k]) => k.toLowerCase() === "content-type")[1],
    /multipart\/form-data; boundary=/,
  );
  assert.match(
    new TextDecoder().decode(new Uint8Array(first.data)),
    /你好 世界/,
  );
  await field.fill("保留草稿");
  await page.keyboard.press("Escape");
  await page.locator(".event-row-with-menu").hover();
  await page.getByRole("button", { name: "回复该用户", exact: true }).click();
  await page.getByText("回复 测试观众", { exact: true }).waitFor();
  assert.equal(await field.inputValue(), "保留草稿");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  const reply = await page.evaluate(() =>
    new TextDecoder().decode(new Uint8Array(window.sent.at(-1).data)),
  );
  assert.match(reply, /name="reply_mid"\r\n\r\n456/);
  assert(!reply.includes("local-not-platform"));
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.getByRole("button", { name: "[笑]", exact: true }).click();
  assert.equal(await field.inputValue(), "[笑]");
  await field.fill("文字仍保留");
  await page.getByRole("button", { name: "表情", exact: true }).click();
  await page.getByRole("button", { name: "大表情", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "未解锁", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "大笑", exact: true }).click();
  await page
    .getByRole("button", { name: "取消回复并选择表情", exact: true })
    .click();
  const count = await page.evaluate(() => window.sent.length);
  assert.equal(count, 2);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已发送" }).waitFor();
  assert.equal(await field.inputValue(), "文字仍保留");
  await page.evaluate(
    () => (window.sendResult = { code: 0, msg: "f", message: "f" }),
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page
    .getByText("这条弹幕没发出去，请修改内容后再试。", { exact: true })
    .waitFor();
  assert.equal(await field.inputValue(), "文字仍保留");
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
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(34, 29, 32)",
  );
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
    assert.equal(await page.locator("textarea").inputValue(), "文字仍保留");
  }
  assert.deepEqual(errors, []);
  console.log(
    "悬浮发送、菜单回复、IME、真实 multipart 编码、两类表情、权限及失败保留通过",
  );
} finally {
  await browser.close();
}
