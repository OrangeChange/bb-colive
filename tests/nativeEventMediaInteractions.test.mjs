import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { componentRuntime, findElement, keyEvent } from "./helpers/componentRuntime.mjs";
import * as displaySettings from "../src/eventDisplaySettings.ts";
import * as styleSettings from "../src/eventStyleSettings.ts";
import { getNativeEventSample } from "./fixtures/nativeEventSamples.ts";
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import * as icons from 'lucide-react';

let vite, mediaAssets, publicStyle;
test.before(async () => {
  vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeEventMediaInteractions.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('..', import.meta.url)), server: {watch:null, middlewareMode: true }, logLevel: 'silent' });
  mediaAssets = await vite.ssrLoadModule('/src/eventMediaAssets.ts');
  publicStyle = await vite.ssrLoadModule('/src/events/publicEventStyle.ts');
});
test.after(async () => { await vite?.close(); });

// 状态测试运行生产函数与处理器；真实 DOM 图片加载由固定浏览器场景验收。
function mediaRuntime() {
  return componentRuntime("src/components/EventRow.tsx", {
    'lucide-react': icons,
    "../eventDisplaySettings": displaySettings,
    "../eventStyleSettings": styleSettings,
    "../eventRowStyles": { resolveEventRowStyle: () => ({ contentColor: null }) },
    "../events/replyMentions": { resolveReplyMention: () => null },
    "../events/publicEventStyle": publicStyle,
    "../eventMediaAssets": mediaAssets,
  }, ["GiftIcon", "BigEmote", "MixedText"]);
}
function avatarRuntime() {
  return componentRuntime('src/components/UserAvatar.tsx', {
    'lucide-react': icons,
    '../eventMediaAssets': mediaAssets,
    '../events/publicEventStyle': publicStyle,
  });
}
const byClass = (tree, name) => findElement(tree, (node) => (node.props?.className ?? "").split(/\s+/).includes(name));
const visibleText = (tree) => renderToStaticMarkup(tree).replace(/<[^>]*>/g, "");

test("头像失败使用内置默认头像，内置图失败才占位，新URL重新加载", () => {
  for (const size of [16, 24, 40]) {
    const app = avatarRuntime();
    const ev = getNativeEventSample("text"); ev.user.avatar = "/wealth-levels/1.png";
    const props = { user: ev.user, size };
    try {
      let tree = app.render("UserAvatar", props); app.effects();
      byClass(tree, "avatar").props.onError();
      tree = app.render("UserAvatar", props);
      assert.equal(byClass(tree, "avatar").props.src, '/media/noface.gif');
      byClass(tree, "avatar").props.onError();
      tree = app.render("UserAvatar", props);
      assert.equal(tree.props.style['--avatar-size'], `${size}px`);
      assert.equal(byClass(tree, "avatar"), null);
      {
        const placeholder = byClass(tree, "avatar-placeholder");
        assert.equal(placeholder.type, "span");
        assert.equal(placeholder.props["aria-label"], "头像不可用");
        assert.equal(placeholder.props.role, 'img');
        assert.match(renderToStaticMarkup(placeholder), /<svg/);
        assert.doesNotMatch(renderToStaticMarkup(placeholder), /👤/);
        assert.equal(findElement(tree, (node) => node.type === "button"), null);
      }
      ev.user.avatar = "/wealth-levels/2.png";
      app.render("UserAvatar", props); app.effects();
      assert.equal(byClass(app.render("UserAvatar", props), "avatar").props.src, "/wealth-levels/2.png");
    } finally { app.close(); }
  }
});

test("Task3：主礼物候选回退、耗尽重试及特效点击阻止冒泡保持", () => {
  const ev = getNativeEventSample("normal-gift");
  ev.gift.webp = "/missing.webp"; ev.gift.gif = "/missing.gif"; ev.gift.icon = "/wealth-levels/1.png";
  for (const allowManualRetry of [true, false]) {
    const app = mediaRuntime(); let plays = 0;
    const props = { gift: ev.gift, allowManualRetry, onPlayEffect: () => plays++ };
    try {
      let tree = app.render("GiftIcon", props); app.effects();
      for (const source of ["/missing.webp", "/missing.gif", "/wealth-levels/1.png", '/laplace/gifts/gift-fallback.png']) {
        const image = byClass(tree, "event-gift-icon"); assert.equal(image.props.src, source);
        image.props.onError(); tree = app.render("GiftIcon", props);
      }
      const fallback = byClass(tree, "gift-icon");
      assert.match(renderToStaticMarkup(fallback), /<svg/);
      assert.doesNotMatch(renderToStaticMarkup(fallback), /🎁/);
      if (allowManualRetry) {
        assert.equal(fallback.type, "button");
        const event = keyEvent(""); fallback.props.onClick(event);
        assert.equal(event.stopped, true);
        tree = app.render("GiftIcon", props);
        assert.equal(byClass(tree, "event-gift-icon").props.src, "/missing.webp");
      } else assert.equal(fallback.type, "button");
      const event = keyEvent(""); byClass(tree, "event-gift-effect-trigger").props.onClick(event);
      assert.equal(event.stopped, true); assert.equal(plays, 1);
      const noSource = { ...props, gift: { name: "无图" } };
      app.render("GiftIcon", noSource); app.effects();
      tree = app.render("GiftIcon", noSource);
      assert.equal(byClass(tree, "event-resource-retry"), null);
    } finally { app.close(); }
  }
});

test("盲盒候选耗尽使用内置原图，内置图失败省略且不生成重试", () => {
  const app = mediaRuntime();
  try {
    const props = { gift: { webp: "/missing.webp" }, className: "blind-gift-icon", fallback: false, allowManualRetry: true };
    const tree = app.render("GiftIcon", props); app.effects();
    byClass(tree, "blind-gift-icon").props.onError();
    const fallback = app.render("GiftIcon", props);
    assert.equal(byClass(fallback, 'blind-gift-icon').props.src, '/media/blind-box-fallback.webp');
    byClass(fallback, 'blind-gift-icon').props.onError();
    assert.equal(app.render("GiftIcon", props), null);
    app.render('GiftIcon', { ...props, gift: {} }); app.effects();
    assert.equal(byClass(app.render('GiftIcon', { ...props, gift: {} }), 'blind-gift-icon').props.src, '/media/blind-box-fallback.webp');
  } finally { app.close(); }
});

test('框加载失败只隐藏框，头像与身份保留；换档后新框重新加载', () => {
  const app = avatarRuntime();
  const user = { uid: '1', uname: '用户', avatar: '/avatar.png', guardLevel: 1, guardMilestone: 'thousand' };
  try {
    let tree = app.render('UserAvatar', { user }); app.effects();
    byClass(tree, 'avatar-frame').props.onError();
    tree = app.render('UserAvatar', { user });
    assert.equal(byClass(tree, 'avatar-frame'), null);
    assert.equal(byClass(tree, 'avatar').props.src, '/avatar.png');
    const next = { ...user, guardMilestone: 'tenThousand' };
    app.render('UserAvatar', { user: next }); app.effects();
    assert.equal(byClass(app.render('UserAvatar', { user: next }), 'avatar-frame').props.src, '/laplace/guard-icons/frame-3-10k.png');
  } finally { app.close(); }
});

test("Task3：大表情与横幅失败文字回退及回看重试保持", () => {
  for (const key of ["big-emote", "banner-emote"]) {
    for (const allowManualRetry of [true, false]) {
      const app = mediaRuntime(), ev = getNativeEventSample(key);
      const props = { emoticon: ev.emoticon, name: ev.text, allowManualRetry };
      try {
        const tree = app.render("BigEmote", props); app.effects(); tree.props.onError();
        const fallback = app.render("BigEmote", props);
        assert.equal(visibleText(fallback), ev.text);
        assert.equal(fallback.type, allowManualRetry ? "button" : "span");
        if (allowManualRetry) {
          fallback.props.onClick();
          assert.equal(app.render("BigEmote", props).props.src, ev.emoticon.url);
        }
      } finally { app.close(); }
    }
  }
});

test("Task3：混排表情失败保留前后文字，回看重试重新显示图", () => {
  for (const allowManualRetry of [true, false]) {
    const app = mediaRuntime(), ev = getNativeEventSample("mixed-emote");
    const props = { text: ev.text, emotes: ev.emotes, allowManualRetry };
    try {
      let tree = app.render("MixedText", props); app.effects();
      byClass(tree, "inline-emote").props.onError(); tree = app.render("MixedText", props);
      assert.equal(visibleText(tree), "文字[热]结尾");
      assert.equal(byClass(tree, "inline-emote"), null);
      if (allowManualRetry) {
        const retry = byClass(tree, "event-resource-retry");
        assert.equal(visibleText(retry), "[热]");
        retry.props.onClick();
        assert.equal(byClass(app.render("MixedText", props), "inline-emote").props.src, ev.emotes["[热]"].url);
      } else assert.equal(byClass(tree, "event-resource-retry"), null);
    } finally { app.close(); }
  }
});
