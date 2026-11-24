import assert from "node:assert/strict";

const targets = await (await fetch("http://localhost:9223/json/list")).json();
const target = targets.find((page) => page.type === "page" && /^http:\/\/(localhost|127\.0\.0\.1):1420\/$/.test(page.url));
assert.ok(target, "请启动带调试端口的开发版");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const result = JSON.parse(data);
  const waiter = pending.get(result.id);
  if (!waiter) return;
  pending.delete(result.id);
  if (result.error) waiter.reject(result.error);
  else waiter.resolve(result.result);
};
async function evaluate(expression) {
  const result = await new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

try {
  await evaluate(String.raw`(async () => {
    const componentSource = await (await fetch('/src/components/EventList.tsx')).text();
    const entrySource = await (await fetch('/src/main.tsx')).text();
    const reactUrl = componentSource.match(/"([^"\n]*\/react\.js[^"\n]*)"/)[1];
    const domUrl = entrySource.match(/"([^"\n]*\/react-dom_client\.js[^"\n]*)"/)[1];
    const React = (await import(reactUrl)).default;
    const { createRoot } = (await import(domUrl)).default;
    const { EventList } = await import('/src/components/EventList.tsx?qa=' + Date.now());
    const { createFeedScrollSession } = await import('/src/events/feedScroll.ts');
    const host = document.createElement('section');
    host.style.cssText = 'position:fixed;inset:40px;z-index:99999;background:var(--color-bg);display:flex;flex-direction:column';
    document.body.append(host);
    const qa = window.__liveContextQA = { host, errors: [], consumed: 0, setTarget: null, append: null, root: null };
    qa.root = createRoot(host, { onUncaughtError: (error) => qa.errors.push(String(error)), onCaughtError: (error) => qa.errors.push(String(error)) });
    function Case({ direction }) {
      const [events, setEvents] = React.useState(() => Array.from({ length: 300 }, (_, n) => ({ id: 'qa-live-' + n, dedupe: 'qa-live-' + n, roomId: 1, ts: Date.now(), msgType: 0, user: { uid: 'qa', uname: '定位测试' }, text: n === 150 ? '目标事件' : ('长短行定位测试 ' + n + ' ').repeat(n % 5 + 1) })));
      const [targetKey, setTargetKey] = React.useState(null);
      const [filtered, setFiltered] = React.useState(true);
      const session = React.useRef(createFeedScrollSession(0));
      qa.setTarget = () => { setFiltered(false); setTargetKey('qa-live-150'); };
      qa.append = () => setEvents((current) => [...current, ...Array.from({ length: 8 }, (_, n) => ({ ...current[0], id: 'qa-new-' + n, dedupe: 'qa-new-' + n }))]);
      return React.createElement(EventList, {
        events, visibleIndices: filtered ? [150] : events.map((_, n) => n),
        viewKey: filtered ? 'qa-filtered' : 'qa-original', feedKey: 'qa-live', feedSession: session.current,
        liveLayout: true, scrollDirection: direction,
        eventMenuHandlers: { regionKey: 'qa-live', contextTargetRegionKey: 'qa-live', contextTargetKey: targetKey,
          isFavorite: () => false, onToggleFavorite: () => {}, isMarked: () => false, onToggleMark: () => {},
          onContextTargetConsumed: () => { qa.consumed++; setTargetKey(null); } },
      });
    }
    qa.render = (direction) => { qa.consumed = 0; qa.root.render(React.createElement(Case, { key: direction, direction })); };
  })()`);
  for (const direction of ["top", "bottom"]) {
    await evaluate(`window.__liveContextQA.render('${direction}')`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await evaluate("window.__liveContextQA.setTarget()");
    let result;
    for (let n = 0; n < 50; n++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      result = await evaluate(`(() => {
        const qa = window.__liveContextQA;
        const row = qa.host.querySelector('[data-event-id="qa-live-150"]');
        const viewport = qa.host.querySelector('[data-feed-key]') ?? row?.closest('.overflow-y-auto');
        const bounds = row?.getBoundingClientRect();
        const hostBounds = qa.host.getBoundingClientRect();
        return { errors: qa.errors, consumed: qa.consumed, visible: !!bounds && bounds.top >= hostBounds.top && bounds.bottom <= hostBounds.bottom, top: bounds?.top, padding: viewport && getComputedStyle(viewport).paddingTop };
      })()`);
      if (result.errors.length || result.consumed) break;
    }
    assert.deepEqual(result.errors, [], `${direction} 不能触发浏览器异常`);
    assert.equal(result.consumed, 1, `${direction} 必须完成定位`);
    assert.equal(result.visible, true, `${direction} 目标必须在视口内`);
    await evaluate("window.__liveContextQA.append()");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const appended = await evaluate(`(() => { const row = window.__liveContextQA.host.querySelector('[data-event-id="qa-live-150"]'); const viewport = row?.closest('.overflow-y-auto'); return { top: row?.getBoundingClientRect().top, padding: viewport && getComputedStyle(viewport).paddingTop, errors: window.__liveContextQA.errors }; })()`);
    assert.deepEqual(appended.errors, []);
    assert.ok(Math.abs(appended.top - result.top) <= 2, `${direction} 追加事件后应保持目标位置：${JSON.stringify({ before: result, after: appended })}`);
    console.log(direction, "定位完成，目标可见，追加事件后位置保持");
  }
} finally {
  await evaluate("window.__liveContextQA?.root.unmount(); window.__liveContextQA?.host.remove(); delete window.__liveContextQA");
  socket.close();
}
