import { load } from "../appData.ts";
import { getThemeModeDefinition } from "../themes/themeModes.ts";
import type { ThemeMode } from "../themes/themeTypes.ts";
import type { OutputScheme } from "./obsConfigurationIdentity.ts";
import { createObsConfigurationId, isObsConfigurationId } from "./obsConfigurationIdentity.ts";
import { themeBindingRegistry } from "../themes/themeBindings.ts";

export interface NativeObsConfiguration {
  id: string;
  name: string;
  roomId: string;
  anchorName?: string;
  themeId: string;
  themeName?: string;
  themeRevision: number;
  scheme?: OutputScheme;
}

export interface ObsThemeOptionSource { themeId: string; name: string; mode?: ThemeMode }

export function obsThemeOptions(configuration: Pick<NativeObsConfiguration, "themeId" | "themeName">, themes: ObsThemeOptionSource[]) {
  const counts = new Map<string, number>();
  for (const theme of themes) counts.set(theme.name, (counts.get(theme.name) ?? 0) + 1);
  const options = themes.map(theme => ({ value: theme.themeId, label: theme.mode && (counts.get(theme.name) ?? 0) > 1 ? `${theme.name} · ${getThemeModeDefinition(theme.mode).label}` : theme.name, ...(theme.mode ? {group:getThemeModeDefinition(theme.mode).label} : {}) }));
  if (!configuration.themeId || themes.some(theme => theme.themeId === configuration.themeId)) return options;
  return [{ value: configuration.themeId, label: `${configuration.themeName || "原主题"}（已删除）`, disabled: true }, ...options];
}

export interface NativeObsConfigurationPort {
  read(): Promise<NativeObsConfiguration[]>;
  write(configurations: NativeObsConfiguration[]): Promise<void>;
}

export function createNativeObsConfigurationStore(port: NativeObsConfigurationPort) {
  let cache: NativeObsConfiguration[] | undefined;
  let pendingRead: Promise<NativeObsConfiguration[]> | undefined;
  const read = async () => {
    if (cache) return cache;
    pendingRead ??= port.read().then(value => cache = value).finally(() => { pendingRead = undefined; });
    return pendingRead;
  };
  return {
    async load() { return structuredClone(await read()); },
    async save(configuration: NativeObsConfiguration) {
      const current = await read();
      const index = current.findIndex(item => item.id === configuration.id);
      const next = structuredClone(current);
      if (index < 0) next.push(structuredClone(configuration));
      else next[index] = structuredClone(configuration);
      await port.write(next);
      cache = next;
    },
    async remove(id: string) {
      const next = (await read()).filter(item => item.id !== id);
      await port.write(next);
      cache = next;
    },
  };
}

const STORE_NAME = "native-obs-configurations.local.json";
const STORE_KEY = "configurations";
const tauriPort: NativeObsConfigurationPort = {
  async read() {
    const store = await load(STORE_NAME, { autoSave: false, defaults: {} });
    const configurations = await store.get<NativeObsConfiguration[]>(STORE_KEY) ?? [];
    if (configurations.every(item => isObsConfigurationId(item.id))) return configurations;
    const recovery = await load("obs-configuration-id-backup.local.json", {autoSave:false,defaults:{}});
    let mapping = await recovery.get<Record<string,string>>("mapping");
    if (!mapping) {
      mapping = {};
      const used = configurations.map(item => item.id);
      for (const configuration of configurations) {
        if (isObsConfigurationId(configuration.id)) continue;
        mapping[configuration.id] = createObsConfigurationId(used);
        used.push(mapping[configuration.id]);
      }
      await recovery.set("configurations", configurations);
      await recovery.set("mapping", mapping);
      await recovery.save();
    }
    const usedIds = [...configurations.map(item=>item.id), ...Object.values(mapping)];
    for (const item of configurations) {
      if (isObsConfigurationId(item.id) || mapping[item.id]) continue;
      mapping[item.id] = createObsConfigurationId(usedIds);
      usedIds.push(mapping[item.id]);
    }
    await recovery.set("mapping",mapping);
    await recovery.save();
    const snapshots = await load("native-obs-themes.local.json", {autoSave:false,defaults:{}});
    const bindings = await load("native-theme-bindings.local.json", {autoSave:false,defaults:{}});
    const originalBindings = await bindings.get<Array<{targetId:string;[key:string]:unknown}>>("bindings") ?? [];
    if (!await recovery.has("bindings")) { await recovery.set("bindings", originalBindings); await recovery.save(); }
    for (const [oldId, newId] of Object.entries(mapping)) {
      const snapshot = await snapshots.get<Record<string,unknown>>(oldId);
      if (snapshot) {
        if (!await recovery.has(oldId)) { await recovery.set(oldId,snapshot); await recovery.save(); }
        await snapshots.set(newId,{...snapshot,targetId:newId});
      }
    }
    await snapshots.save();
    const compatible = await load("compatible-theme-runtime.local.json", {autoSave:false,defaults:{}});
    const nativeRuntime = await load("native-theme-runtime.local.json", {autoSave:false,defaults:{}});
    if (!await recovery.has("compatibleRuntime")) {
      await recovery.set("compatibleRuntime",await compatible.entries());
      await recovery.set("nativeRuntime",await nativeRuntime.entries());
      await recovery.save();
    }
    for (const [oldId,newId] of Object.entries(mapping)) {
      const runtime=await compatible.get<{context:Record<string,unknown>;[key:string]:unknown}>(oldId);
      if(runtime)await compatible.set(newId,{...runtime,context:{...runtime.context,targetId:newId}});
      for(const prefix of ["activeCss:target:","projection:target:"]){
        const value=await nativeRuntime.get(prefix+oldId);
        if(value!==undefined)await nativeRuntime.set(prefix+newId,value);
      }
    }
    await compatible.save();
    await nativeRuntime.save();
    await themeBindingRegistry.remapTargetIds!(mapping);
    const next = configurations.map(item=>({...item,id:mapping![item.id]??item.id}));
    await store.set(STORE_KEY,next);
    await store.save();
    for (const oldId of Object.keys(mapping)) {
      await snapshots.delete(oldId);
      await compatible.delete(oldId);
      for(const prefix of ["activeCss:target:","projection:target:"])await nativeRuntime.delete(prefix+oldId);
    }
    await snapshots.save();
    await compatible.save();
    await nativeRuntime.save();
    return next;
  },
  async write(configurations) {
    const store = await load(STORE_NAME, { autoSave: false, defaults: {} });
    await store.set(STORE_KEY, configurations);
    await store.save();
  },
};

export const nativeObsConfigurationStore = createNativeObsConfigurationStore(tauriPort);
