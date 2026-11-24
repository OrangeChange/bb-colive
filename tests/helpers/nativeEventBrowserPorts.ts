type Handler = (event: { payload: unknown }) => void | Promise<void>;
export function createNativeEventBrowserPorts(label: string) {
  const handlers = new Map<string, Set<Handler>>();
  const stores = new Map<string, Map<string, unknown>>();
  const closeStates = new Map<string, unknown>();
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const messages: { target: string; name: string; payload: unknown }[] = [];
  const observers = new Set<() => void>();
  const notify = () => observers.forEach(callback => callback());
  const port = {
    label, calls, messages,
    subscribe(callback: () => void) { observers.add(callback); return () => { observers.delete(callback); }; },
    async listen<T>(name: string, callback: (event: { payload: T }) => void | Promise<void>, target = label) {
      const key = `${target}:${name}`;
      const listeners = handlers.get(key) ?? new Set<Handler>();
      const handler = callback as Handler;
      listeners.add(handler); handlers.set(key, listeners);
      return () => { listeners.delete(handler); };
    },
    async emitTo(target: string, name: string, payload?: unknown) {
      messages.push({ target, name, payload });
      for (const callback of [...(handlers.get(`${target}:${name}`) ?? [])]) await callback({ payload });
      notify();
    },
    async load(file: string) {
      const data = stores.get(file) ?? new Map<string, unknown>(); stores.set(file, data);
      return {
        async get<T>(key: string): Promise<T | null> { return (data.get(key) ?? null) as T | null; },
        async set(key: string, value: unknown) { data.set(key, structuredClone(value)); },
        async save() { calls.push({ command: 'store.save', args: { file } }); notify(); },
      };
    },
    async invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
      calls.push({ command, args }); notify();
      let result: unknown = null;
      if (command === 'set_window_diagnostic_close_state') {
        const state = args?.state as { instanceId: string }; closeStates.set(state.instanceId, structuredClone(state));
      } else if (command === 'read_window_diagnostic_close_states') result = [...closeStates.values()];
      else if (command === 'get_diagnostic_status') result = { status: 'healthy', totalBytes: 0, normalBytes: 0, detailedBytes: 0, writeFailures: 0, discarded: 0, truncated: 0, pending: 0, droppedRecords: 0 };
      else if (command !== 'append_log' && command !== 'install_floating_window_snap' && command !== 'set_floating_window_material') throw new Error(`未支持的测试端口命令：${command}`);
      return result as T;
    },
  };
  let position = { x: 10, y: 20 }, size = { width: 480, height: 560 };
  const action = async (command: string, args?: Record<string, unknown>) => { calls.push({ command, args }); notify(); };
  const currentWindow = {
    label,
    outerPosition: async () => ({ ...position }), innerSize: async () => ({ ...size }),
    setPosition: async (value: { x: number; y: number }) => { position = { x: value.x, y: value.y }; },
    setSize: async (value: { width: number; height: number }) => { size = { width: value.width, height: value.height }; },
    setAlwaysOnTop: (value: boolean) => action('window.setAlwaysOnTop', { value }),
    setMaximizable: (value: boolean) => action('window.setMaximizable', { value }),
    setResizable: (value: boolean) => action('window.setResizable', { value }),
    setIgnoreCursorEvents: (value: boolean) => action('window.setIgnoreCursorEvents', { value }),
    setEffects: (value: unknown) => action('window.setEffects', { value }),
    clearEffects: () => action('window.clearEffects'),
    show: () => action('window.show'), destroy: () => action('window.destroy'),
    startDragging: () => action('window.startDragging'), startResizeDragging: (direction: string) => action('window.startResizeDragging', { direction }),
    onMoved: <T>(callback: (event: { payload: T }) => void) => port.listen('tauri://move', callback),
    onResized: <T>(callback: (event: { payload: T }) => void) => port.listen('tauri://resize', callback),
    onScaleChanged: <T>(callback: (event: { payload: T }) => void) => port.listen('tauri://scale-change', callback),
    onCloseRequested: async (_callback: unknown) => () => {},
  };
  return { ...port, getCurrentWindow: () => currentWindow,
    getAllWindows: async () => [{ label: 'main' }, currentWindow],
    currentMonitor: async () => ({ name: '浏览器合成显示器', position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 }, workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } }, scaleFactor: 1 }),
  };
}

const requestedKind = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('kind') : null;
const kind = requestedKind && ['gift','gift-only','superchat','guard'].includes(requestedKind) ? requestedKind : 'display';
export const nativeEventBrowserPorts = createNativeEventBrowserPorts(kind);
export const { listen, emitTo, invoke, load, getCurrentWindow, getAllWindows, currentMonitor } = nativeEventBrowserPorts;
export const emit = emitTo;
export const Effect = { Acrylic:'acrylic' };
export const primaryMonitor = currentMonitor;
export const availableMonitors = async () => [await currentMonitor()];
