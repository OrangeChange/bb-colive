import { createNativeEventBrowserPorts } from './nativeEventBrowserPorts';
export const ports = createNativeEventBrowserPorts('main');
export const { listen, emitTo, load, getCurrentWindow, currentMonitor } = ports;
export const primaryMonitor = currentMonitor;
const windows = new Map<string, WebviewWindow>();
export const nativeWindows = {
  windows,
  closeGates: new Map<string, Promise<void>>(),
  createFailures: new Set<string>(),
  closeFailures: new Set<string>(),
  closeRequested: new Set<string>(),
  silentDestroyed: new Set<string>(),
  silentCreated: new Set<string>(),
};
export class WebviewWindow {
  callbacks = new Map<string, (event?: { payload: unknown }) => void>();
  geometry = { x: 0, y: 0, width: 360, height: 360 };
  constructor(public label: string, public options?: Record<string, unknown>) {
    if (options) for (const key of ['x','y','width','height'] as const) if (typeof options[key] === 'number') this.geometry[key] = options[key];
    if (!nativeWindows.createFailures.has(label)) windows.set(label,this);
  }
  static async getByLabel(label: string) {
    const window = windows.get(label);
    return window ? Object.assign(Object.create(WebviewWindow.prototype), window) as WebviewWindow : null;
  }
  async once(name: string, callback: (event?: { payload: unknown }) => void) {
    this.callbacks.set(name,callback);
    if (name === 'tauri://created' && !nativeWindows.createFailures.has(this.label) && !nativeWindows.silentCreated.has(this.label)) callback();
    if (name === 'tauri://error' && nativeWindows.createFailures.has(this.label)) callback({ payload: 'native create rejected' });
    return () => this.callbacks.delete(name);
  }
  async close() {
    if (nativeWindows.closeFailures.has(this.label)) throw new Error('native close rejected');
    nativeWindows.closeRequested.add(this.label);
    const destroy = () => { windows.delete(this.label); if (!nativeWindows.silentDestroyed.has(this.label)) this.callbacks.get('tauri://destroyed')?.(); };
    const gate = nativeWindows.closeGates.get(this.label);
    if (gate) void gate.then(destroy);
    else destroy();
  }
  async show() {}
  async setFocus() {}
  async outerPosition() { return {x:this.geometry.x,y:this.geometry.y}; }
  async innerSize() { return {width:this.geometry.width,height:this.geometry.height}; }
}

export async function invoke(command: string, args?: Record<string, any>) {
  if (command === 'create_app_window') {
    const options = args!.options;
    if (nativeWindows.createFailures.has(options.label)) throw new Error('native create rejected');
    new WebviewWindow(options.label, options);
    return;
  }
  if (command === 'get_app_data_directory') return 'C:/test-data';
  return ports.invoke(command, args);
}
