import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createDiagnosticContext, flushAllDiagnosticLogs } from '../../src/diagnostics/diagnosticLogger.ts';
import { createRenderDiagnosticLogger } from '../../src/diagnostics/renderLogger.ts';
import { createWindowDiagnosticReceiver } from '../../src/diagnostics/windowDiagnosticBridge.ts';

export async function windowDiagnosticRuntime(label = 'display', options = {}) {
  const handlers = new Map(), calls = [], writes = [], effects = [], refs = [], states = [], messages = [], intervals = new Map();
  const stores = new Map();
  let position = { x: 10, y: 20 }, size = { width: 400, height: 500 };
  const closeStates = new Map();
  const port = {
    label, effects, refs, states, calls, messages, intervals, stylesLoaded: false,
    setInterval(callback, delay) { const timer = setInterval(callback, delay); intervals.set(timer, { callback, delay }); return timer; },
    clearInterval(timer) { intervals.delete(timer); clearInterval(timer); },
    async listen(name, callback, target = label) {
      const key = `${target}:${name}`, listeners = handlers.get(key) ?? new Set();
      listeners.add(callback); handlers.set(key, listeners);
      return () => listeners.delete(callback);
    },
    async emitTo(target, name, payload) {
      messages.push({ target, name, payload });
      if (port.failDiagnostics && target === 'main' && name.startsWith('diagnostic:')) throw new Error('diagnostic transport failed');
      for (const callback of handlers.get(`${target}:${name}`) ?? []) await callback({ payload });
    },
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === 'set_window_diagnostic_close_state') closeStates.set(args.state.instanceId, args.state);
      if (command === 'read_window_diagnostic_close_states') return [...closeStates.values()];
    },
    getAllWindows: async () => port.destroyed ? [{ label: 'main' }] : [{ label: 'main' }, { label }],
    useEffect(effect) { effects.push(effect); },
    useState(initial) {
      const state = { value: typeof initial === 'function' ? initial() : initial };
      states.push(state);
      return [state.value, (value) => { state.value = typeof value === 'function' ? value(state.value) : value; }];
    },
    useRef(current) { const ref = { current }; refs.push(ref); return ref; },
    async load(file) {
      const data = stores.get(file) ?? new Map(); stores.set(file, data);
      return { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value), save: async () => { port.onSaveStarted?.(file); await port.saveGate; calls.push({ command: 'save', file }); } };
    },
    window: {
      label, setSize: async value => { size = { width:value.width, height:value.height }; calls.push({command:'setSize',...size}); },
      setPosition: async value => { position = { x:value.x, y:value.y }; calls.push({command:'setPosition',...position}); }, setAlwaysOnTop: async () => {}, setMaximizable: async () => {},
      outerPosition: async () => ({ ...position }), innerSize: async () => ({ ...size }),
      onMoved: async (handler) => { port.moved = handler; return () => { port.moved = undefined; }; },
      onResized: async (handler) => { port.resized = handler; return () => { port.resized = undefined; }; },
      onScaleChanged: async () => () => {},
      onCloseRequested: async (handler) => { port.close = handler; return () => { port.close = undefined; }; },
      setIgnoreCursorEvents: async (locked) => calls.push({ command: 'lock', locked }),
      setResizable: async () => {}, show: async () => {}, destroy: async () => { port.destroyed = true; calls.push({ command: 'destroy' }); },
    },
  };
  const key = `__windowDiagnostics_${label}`;
  globalThis[key] = port;
  const p = `globalThis[${JSON.stringify(key)}]`;
  const modules = {
    '@tauri-apps/api/event': `export const listen = (name, cb) => ${p}.listen(name, cb); export const emitTo = (target, name, payload) => ${p}.emitTo(target, name, payload);`,
    '@tauri-apps/api/core': `export const invoke = (command, args) => ${p}.invoke(command, args);`,
    '@tauri-apps/api/window': `export const getAllWindows = () => ${p}.getAllWindows(); export const getCurrentWindow = () => ${p}.window; export const currentMonitor = async () => null;`,
    '@tauri-apps/plugin-store': `export const load = (file) => ${p}.load(file);`,
    react: `export const useEffect = (effect, deps) => ${p}.useEffect(effect, deps); export const useLayoutEffect = (effect, deps) => ${p}.useEffect(effect, deps); export const useRef = (current) => ${p}.useRef(current); export const useState = (initial) => ${p}.useState(initial); export const useCallback = (fn) => fn; export const useMemo = (factory) => factory(); export const useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();`,
    '../components/EventRow': 'export const EventRow = () => null;',
    '../components/EventRowSlot': 'export const EventRowSlot = () => null;',
    '../components/EventAreaStyle': 'export const useEventAreaStyle = () => ({ scope: "window-diagnostic", style: null });',
    '../components/GiftEffectOverlay': 'export const GiftEffectOverlay = () => null;',
  };
  if (options.entry) {
    modules['./App.css'] = 'export default {};';
    port.moduleLoads = [];
    port.rendered = new Promise((resolve) => { port.render = resolve; });
    modules['react-dom/client'] = `export default { createRoot: () => ({ render: () => ${p}.render() }) };`;
    modules['./App'] = `${p}.moduleLoads.push('main'); export default function App() { return null; }`;
    modules['./uiInteraction'] = 'export const installInteractionPolicy = () => {};';
    for (const [path, name] of [['./windows/FloatingEventWindow', 'display'], ['./windows/GiftWindow', 'gift']]) {
      modules[path] = `import { getDiagnosticContext } from '/src/diagnostics/diagnosticLogger.ts'; ${p}.moduleLoads.push('${label}'); getDiagnosticContext().record({ subsystem: 'window', action: 'module-load', outcome: 'loaded' }); export const ${name === 'display' ? 'FloatingEventWindow' : 'GiftWindow'} = () => null;`;
    }
  }
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-helpers-windowDiagnosticRuntime.mjs", root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, plugins: [{
      name: 'window-diagnostic-native-ports',
      resolveId: (id) => id.startsWith('\0window-port:') ? id : undefined,
      load: (id) => {
        if (id === '\0window-port:./App.css') port.stylesLoaded = true;
        return modules[id.slice('\0window-port:'.length)];
      },
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/App.css')) port.stylesLoaded = true;
        if (!id.replaceAll('\\', '/').includes('/src/')) return;
        if (options.entry) code = code.replaceAll('import "./App.css";', 'import "\0window-port:./App.css";');
        for (const name of Object.keys(modules)) {
          if (name === 'react' && !['/FloatingEventWindow.tsx', '/useLocalFeedReading.ts', '/windowThemeSettings.ts'].some(path => id.replaceAll('\\', '/').endsWith(path))) continue;
          code = code.replaceAll(`from "${name}"`, `from "\0window-port:${name}"`);
          code = code.replaceAll(`import("${name}")`, `import("\0window-port:${name}")`);
        }
        if (id.replaceAll('\\', '/').endsWith('/FloatingEventWindow.tsx')) {
          code = code.replaceAll('setInterval(', `${p}.setInterval(`).replaceAll('clearInterval(', `${p}.clearInterval(`);
        }
        return code;
      },
    }] });
  const bridge = await server.ssrLoadModule('/src/diagnostics/windowDiagnosticBridge.ts');
  if (options.installSender !== false) await bridge.installWindowDiagnosticSender(label);
  const context = createDiagnosticContext({ sessionId: 'launch-window-test', flushIntervalMs: 0, invoke: async (_, args) => writes.push(args) });
  const render = createRenderDiagnosticLogger({ context, flushIntervalMs: 0, invoke: async (_, args) => writes.push(args) });
  const receiver = createWindowDiagnosticReceiver({
    listen: (name, cb) => port.listen(name, cb, 'main'), emitTo: port.emitTo,
    getWindowLabels: async () => (await port.getAllWindows()).map((window) => window.label),
    readCloseStates: async () => [...closeStates.values()], recordApp: (input) => context.record(input),
    recordRender: (input) => 'featureId' in input ? render.recordFeature(input) : render.record(input),
    flushLogs: flushAllDiagnosticLogs,
  });
  await receiver.start();
  return { server, bridge, receiver, port, writes, context, render,
    records: () => writes.flatMap((write) => write.lines.trim().split('\n').map(JSON.parse)),
    listenerCount: () => [...handlers.values()].reduce((count, listeners) => count + listeners.size, 0),
    async finish() {
      bridge.stopWindowDiagnosticBridge(); receiver.stop(); context.stop(); render.stop();
      const logger = await server.ssrLoadModule('/src/diagnostics/diagnosticLogger.ts');
      logger.getDiagnosticContext().stop?.();
      const childRender = await server.ssrLoadModule('/src/diagnostics/renderLogger.ts'); childRender.renderDiagnosticLogger.stop();
      const childSource = await server.ssrLoadModule('/src/diagnostics/sourceLogger.ts'); childSource.sourceDiagnosticLogger.stop();
      await server.close(); delete globalThis[key];
    },
  };
}

export async function mountFloatingWindow(runtime, strictMode = false, reactive = false) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({getPropertyValue: () => ""});
  const originalMutationObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const elements = new Map();
  globalThis.window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} };
  globalThis.document = {
    documentElement: {dataset: {softwareScheme: 'light'}, classList:{contains:()=>false}},
    getElementById: (id) => elements.get(id) ?? null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild: (element) => elements.set(element.id, element) },
  };
  const { FloatingEventWindow } = await runtime.server.ssrLoadModule('/src/windows/FloatingEventWindow.tsx');
  const lifecycleEffects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  if (reactive) {
    const createState = runtime.port.useState.bind(runtime.port);
    const createRef = runtime.port.useRef.bind(runtime.port);
    runtime.port.useState = (initial) => {
      const index = stateIndex++;
      if (!runtime.port.states[index]) createState(initial);
      const state = runtime.port.states[index];
      return [state.value, value => { state.value = typeof value === 'function' ? value(state.value) : value; }];
    };
    runtime.port.useRef = (initial) => {
      const index = refIndex++;
      return runtime.port.refs[index] ?? createRef(initial);
    };
    runtime.port.useEffect = (effect, deps) => {
      const index = effectIndex++;
      const previous = lifecycleEffects[index];
      if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.();
      const current = { deps, effect };
      lifecycleEffects[index] = current;
      runtime.port.effects.push(() => { current.cleanup = effect(); });
    };
    runtime.port.rerender = async () => {
      stateIndex = refIndex = effectIndex = 0;
      runtime.port.effects.length = 0;
      FloatingEventWindow({ kind: runtime.port.label });
      runtime.port.effects.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
    };
  }
  FloatingEventWindow({ kind: runtime.port.label });
  const start = () => runtime.port.effects.map((effect) => effect());
  let cleanups = start();
  if (strictMode) { cleanups.forEach((cleanup) => cleanup?.()); cleanups = start(); }
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return async () => {
    if (reactive) lifecycleEffects.forEach(effect => effect.cleanup?.());
    else cleanups.forEach((cleanup) => cleanup?.());
    await new Promise((resolve) => setImmediate(resolve));
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.getComputedStyle = originalComputedStyle;
    globalThis.MutationObserver = originalMutationObserver;
  };
}
