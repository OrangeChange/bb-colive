import { uiText } from "../i18n/index.ts";
import { load } from "../appData.ts";
import { emit } from "@tauri-apps/api/event";
import type { ThemeTarget } from "./themeTypes.ts";

export interface ThemeBinding {
  targetId: string;
  targetKind: ThemeTarget;
  themeId: string;
  revision: number;
  displayScale?: number;
}
export const THEME_BINDINGS_EVENT = "theme-bindings-changed";

export interface ThemeBindingPort {
  read(): Promise<ThemeBinding[]>;
  write(bindings: ThemeBinding[]): Promise<void>;
}

export interface ThemeBindingRegistry {
  load(): Promise<ThemeBinding[]>;
  bind(binding: ThemeBinding): Promise<void>;
  setDisplayScale(targetId: string, displayScale: number): Promise<void>;
  remove(targetId: string): Promise<void>;
  remapTargetIds?(mapping: Record<string,string>): Promise<void>;
  subscribe(listener: (binding: ThemeBinding) => void): () => void;
}

export function createThemeBindingRegistry(port: ThemeBindingPort): ThemeBindingRegistry {
  const listeners = new Set<(binding: ThemeBinding) => void>();
  let cache: ThemeBinding[] | undefined;
  let pendingMutation: Promise<void> = Promise.resolve();
  const normalizeScale = (value: unknown) => typeof value === "number" && Number.isFinite(value)
    ? Math.max(0.5, Math.min(3, value))
    : 1;
  const normalizeBinding = (binding: ThemeBinding): ThemeBinding => ({
    ...binding,
    displayScale: normalizeScale(binding.displayScale),
  });
  const read = async () => cache ??= (await port.read()).map(normalizeBinding);
  const mutate = <T>(change: (current: ThemeBinding[]) => { next: ThemeBinding[]; result: T }): Promise<T> => {
    const operation = pendingMutation.then(async () => {
      const { next, result } = change(await read());
      await port.write(next);
      cache = next;
      return result;
    });
    pendingMutation = operation.then(() => undefined, () => undefined);
    return operation;
  };
  return {
    async remapTargetIds(mapping) {
      await mutate(current=>({next:current.map(item=>({...item,targetId:mapping[item.targetId]??item.targetId})),result:undefined}));
    },
    async load() { return structuredClone(await read()); },
    async bind(binding) {
      await mutate(current => ({
        next: [...current.filter(item => item.targetId !== binding.targetId), normalizeBinding({
          ...structuredClone(binding),
          displayScale: binding.displayScale ?? current.find(item => item.targetId === binding.targetId)?.displayScale,
        })],
        result: undefined,
      }));
      const saved = (await read()).find(item => item.targetId === binding.targetId)!;
      listeners.forEach(listener => listener(structuredClone(saved)));
    },
    async setDisplayScale(targetId, displayScale) {
      const saved = await mutate(current => {
        const existing = current.find(item => item.targetId === targetId);
        if (!existing) throw new Error(uiText("themeBindings.createThemeBindingRegistry.setDisplayScale.saved"));
        const binding = normalizeBinding({ ...existing, displayScale });
        return { next: current.map(item => item.targetId === targetId ? binding : item), result: binding };
      });
      listeners.forEach(listener => listener(structuredClone(saved)));
    },
    async remove(targetId) {
      await mutate(current => ({ next: current.filter(item => item.targetId !== targetId), result: undefined }));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const STORE_NAME = "native-theme-bindings.local.json";
const STORE_KEY = "bindings";
const tauriPort: ThemeBindingPort = {
  async read() {
    const store = await load(STORE_NAME, { autoSave: false, defaults: {} });
    return await store.get<ThemeBinding[]>(STORE_KEY) ?? [];
  },
  async write(bindings) {
    const store = await load(STORE_NAME, { autoSave: false, defaults: {} });
    await store.set(STORE_KEY, bindings);
    await store.save();
    await emit(THEME_BINDINGS_EVENT, bindings);
  },
};

export const themeBindingRegistry = createThemeBindingRegistry(tauriPort);
export const loadThemeBindings = () => themeBindingRegistry.load();

