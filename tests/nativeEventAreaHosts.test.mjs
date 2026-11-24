import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getNativeEventSample } from "./fixtures/nativeEventSamples.ts";
function renderFloatingMarkup(component, props) {
  const previousComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#ffffff" });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { documentElement: { dataset: { softwareScheme: "light" } } };
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
  try { return renderToStaticMarkup(React.createElement(component, props)); }
  finally { globalThis.getComputedStyle = previousComputedStyle; globalThis.document = previousDocument; globalThis.window = previousWindow; }
}
let vite, preferences, settings;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeEventAreaHosts.test.mjs", configFile: false, esbuild: { jsx: "automatic" },
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ DEFAULT_EVENT_DISPLAY_PREFERENCES: preferences } =
    await vite.ssrLoadModule("/src/eventDisplaySettings.ts"));
  ({ DEFAULT_EVENT_STYLE_SETTINGS: settings } = await vite.ssrLoadModule(
    "/src/eventStyleSettings.ts",
  ));
});
after(async () => {
  await vite?.close();
});

async function render(path, name, props) {
  const module = await vite.ssrLoadModule(path);
  return name === "FloatingEventWindow" ? renderFloatingMarkup(module[name], props) : renderToStaticMarkup(React.createElement(module[name], props));
}

function config(html, values) {
  const scopes = [
    ...html.matchAll(/<[\w-]+\b[^>]*\sdata-event-style-scope="([^"]+)"/g),
  ];
  const styles = [
    ...html.matchAll(
      /<style data-event-style-config="([^"]+)">([\s\S]*?)<\/style>/g,
    ),
  ];
  assert.equal(scopes.length, 1);
  assert.equal(styles.length, 1, "每个宿主只生成一份区域配置");
  assert.equal(styles[0][1], scopes[0][1]);
  for (const [name, value] of Object.entries(values)) {
    assert.ok(
      styles[0][2].includes(`--${name}:${value};`),
      `${name} 应为 ${value}`,
    );
  }
  assert.equal(
    (styles[0][2].match(/\.event\[data-event-role=/g) ?? []).length,
    60,
  );
  assert.match(html, /class="[^"]*event-area /);
  assert.match(html, /class="event-list(?: |")/);
  return styles[0][2];
}

function archiveConfig(html) {
  assert.match(html, /event-area review/);
  assert.doesNotMatch(html, /data-event-style-config/);
  assert.doesNotMatch(html, /data-event-style-scope/);
}

test("EventList 空区域保留独立配置，现场与默认布局取当前参数", async () => {
  const { createFeedScrollSession } = await vite.ssrLoadModule(
    "/src/events/feedScroll.ts",
  );
  for (const liveLayout of [true, false]) {
    config(
      await render("/src/components/EventList.tsx", "EventList", {
        events: [],
        visibleIndices: [],
        viewKey: "fixed",
        feedKey: "fixed",
        feedSession: createFeedScrollSession(0),
        liveLayout,
        eventFontSize: 23,
        displayPreferences: {
          ...preferences,
          eventPadding: 9,
          eventSpacing: 7,
        },
      }),
      {
        "event-font-size": liveLayout ? "23px" : "13px",
        "event-config-padding-scale": String(9 / (liveLayout ? 16 : 14)),
        "event-config-spacing-scale": String(7 / (liveLayout ? 16 : 14)),
      },
    );
  }
});
test("回看时间线保留独立14px字号与紧凑间距", async () => {
  archiveConfig(
    await render(
      "/src/components/ReviewSessionTimeline.tsx",
      "ReviewSessionTimeline",
      {
        repository: {},
        readingMemory: { get: () => null },
        sessionId: "fixed",
        active: false,
        eventFontSize: 24,
        displayPreferences: {
          ...preferences,
          eventPadding: 8,
          eventSpacing: 5,
        },
      },
    ),
    {
      "event-font-size": "13px",
      "big-emote-size": "20px",
      "event-padding": "6px",
      "event-spacing": "0px",
    },
  );
});

test("检索摘要与收藏保留紧凑配置，配置不随摘要行数重复", async () => {
  const { useGeneralSettings } = await vite.ssrLoadModule(
    "/src/generalSettings.ts",
  );
  const state = useGeneralSettings.getInitialState();
  const values = {
    "event-font-size": "13px",
    "big-emote-size": "20px",
    "event-padding": "6px",
    "event-spacing": "0px",
    "avatar-size": `${state.eventStyleSettings.reviewAvatarSize}px`,
  };
  const event = getNativeEventSample("text");
  const html = await render(
    "/src/components/ReviewOwnerEventResults.tsx",
    "ReviewOwnerEventResults",
    {
      page: {
        items: [
          {
            session: {
              sessionId: "fixed",
              roomId: event.roomId,
              startedAt: event.ts,
            },
            matches: [1, 2, 3].map((index) => ({
              eventKey: `fixed-${index}`,
              eventTs: event.ts,
              payloadJson: JSON.stringify({ ...event, id: `fixed-${index}` }),
            })),
            matchCount: 3,
          },
        ],
        hasMore: false,
      },
      loading: false,
      error: null,
      hasConditions: true,
    },
  );
  archiveConfig(html, values);
  assert.equal((html.match(/data-event-layout="review"/g) ?? []).length, 3);
  archiveConfig(
    await render(
      "/src/components/ReviewFavoritesPanel.tsx",
      "ReviewFavoritesPanel",
      {
        repository: {},
        owners: [],
        active: false,
      },
    ),
    values,
  );
});

test("浮窗两种日志独占配置，壳和拖拽缩放位于配置之外", async () => {
  const { DEFAULT_EVENT_WINDOW_PREFERENCES: prefs } = await vite.ssrLoadModule(
    "/src/windows/eventWindowPreferences.ts",
  );
  for (const kind of ["display", "gift"]) {
    const html = await render(
      "/src/windows/FloatingEventWindow.tsx",
      "FloatingEventWindow",
      { kind },
    );
    config(html, {
      "event-font-size": `${prefs.fontSize}px`,
      "event-config-padding-scale": String(prefs.display.eventPadding / 16),
      "event-config-spacing-scale": String(prefs.display.eventSpacing / 16),
    });
    assert.ok(!html.match(/<main[^>]*data-event-style-scope/));
    const logStart = html.indexOf('role="log"');
    assert.ok(logStart > html.indexOf("data-tauri-drag-region"));
    assert.ok(html.indexOf("data-event-style-config") > logStart);
    assert.match(
      html,
      new RegExp(
        `event-area window window-${kind === "display" ? "chat" : "pay"}`,
      ),
    );
  }
});
