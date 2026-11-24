import { resolveOutputScheme } from "./obsConfigurationIdentity.ts";
import { getEventEffect } from "../protocol/giftEffects.ts";
import { createNativeEventVisibilityPredicate } from '../events/outputEventPolicy.ts';
import { compatibleEventDecisionOf } from '../compat/CompatibleEventRenderer.tsx';
import { resolveObsRenders } from './obsRenders.ts';
function outputThemePolicy(snapshot: ObsThemeSnapshot) {
  const renders = resolveObsRenders(snapshot);
  const nativeAllows = createNativeEventVisibilityPredicate('eventVisibility' in snapshot ? snapshot.eventVisibility : undefined);
  return {
    nativeMain: !renders.main,
    allowsMain: (event: import('../protocol/types.ts').DanmakuEvent) => renders.main ? compatibleEventDecisionOf(renders.main, event) !== 'omit' : nativeAllows(event),
    allowsSticky: (event: import('../protocol/types.ts').DanmakuEvent) => renders.sticky ? compatibleEventDecisionOf(renders.sticky, event) !== 'omit' : nativeAllows(event),
  };
}
import {createPreviewResourceSender} from "../preview/stylePreviewResources.ts";
import { getPreview,subscribePreview } from "../preview/stylePreviewSession.ts";
import { previewMessage } from "../preview/stylePreviewProtocol.ts";
import type { StylePreviewSnapshot } from "../preview/stylePreviewState.ts";
import { obsSamplePreferences } from "./obsBrowserState.ts";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { applyRoomGuardProfileToEvents } from "../protocol/roomGuardProfile.ts";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { nativeObsConfigurationStore } from "./nativeObsConfigurations.ts";
import {
  loadObsThemeSnapshot,
  type ObsThemeSnapshot,
} from "./nativeObsTheme.ts";
import { roomSessions } from "./sharedRoomConnection.ts";
import { createObsOutputState } from "./obsOutputState.ts";
import { useSession } from "../stores/session.ts";
import { useConnection } from "../stores/connection.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import { useTheme } from "../theme.ts";
import { createEventWindowPreferences } from "../windows/eventWindowPreferences.ts";
import { createDefaultDisplayWindowFilters } from '../eventFilterSettings.ts';
import { loadSceneSettings, SCENE_SETTINGS_KEY } from "../components/sceneSettings.ts";
import { obsSampleEvents } from "./obsSamples.ts";
import type { ConnState } from "../protocol/types.ts";
import type { LaplaceStateUpdate } from "../protocol/laplaceCompatibility.ts";
import type { ObsQuery, ObsWireState } from "./obsProtocol.ts";

type Lease = Awaited<ReturnType<typeof roomSessions.acquire>>;
type Output = {
  identity: string;
  configurationScheme?: "follow" | "light" | "dark";
  query: ObsQuery;
  clients: Set<string>;
  model: ReturnType<typeof createObsOutputState>;
  snapshot: ObsThemeSnapshot;
  connection: ConnState;
  updates: Map<string, LaplaceStateUpdate>;
  lease?: Lease;
  releaseAt?: number;
  last?: string;
  sequence: number;
  giftEffectSession: string;
  giftEffectSequence: number;
  sampleAt?: number;
  sample: boolean;
  dirty: boolean;
  batchTimer?: ReturnType<typeof setTimeout>;
  nextExpiry: number;
};
const outputs = new Map<string, Output>();
const renderFailures = new Map<
  string,
  { clientId: string; configurationId?: string; message: string }
>();
const publishRenderFailures = () =>
  emit("obs:render-failures", [...renderFailures.values()]);
const previewClients = new Map<string,{last:StylePreviewSnapshot|null;tail:Promise<void>;encode:ReturnType<typeof createPreviewResourceSender>}>();
function sendCurrentPreview(id:string,initial=false){const client=previewClients.get(id);if(!client)return;const state=getPreview(),message=previewMessage(initial?null:client.last,state);client.tail=client.tail.then(()=>send(id,client.encode(message,initial))).catch(()=>{});client.last=state;}
const clients = new Map<string, { query: ObsQuery; output?: Output }>();
const preferences = () => ({
  ...createEventWindowPreferences(
    useGeneralSettings.getState(),
    loadSceneSettings(),
  ),
  sceneFilters: undefined,
  displayFilters: createDefaultDisplayWindowFilters(),
  showGiftEffect: useGeneralSettings.getState().showObsGiftEffect,
  showGuardEffect: useGeneralSettings.getState().showObsGuardEffect,
});
const scheme = () => {
  const mode = useTheme.getState().mode;
  return mode === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : mode;
};
const send = async (clientId: string, message: unknown) => {
  if (clientId.startsWith("preview:"))
    await emit("obs:state", { clientId, message });
  else
    await invoke("obs_send", { clientId, payload: message });
};
function publish(output: Output, force = false) {
  const state = output.model.snapshot(output.sampleAt ?? Date.now());
  if (output.connection.roomGuardProfile && output.snapshot.roomId != null) {
    state.events = applyRoomGuardProfileToEvents(
      state.events,
      output.snapshot.roomId,
      output.connection.roomGuardProfile,
    ).map((event, index) => ({
      ...event,
      receivedAt: state.events[index].receivedAt,
    }));
    state.sticky = state.sticky.map((card) => ({
      ...card,
      event: applyRoomGuardProfileToEvents(
        [card.event],
        output.snapshot.roomId!,
        output.connection.roomGuardProfile!,
      )[0],
    }));
  }
  const clean = <T extends (typeof state.sticky)[number]["event"]>(
    event: T,
  ) => {
    const { raw: _raw, ...value } = event;
    return value;
  };
  state.events = state.events.map(clean);
  state.sticky = state.sticky.map((card) => ({
    ...card,
    event: clean(card.event),
  }));
  const visibleUsers = new Set(
    [...state.events, ...state.sticky.map((card) => card.event)].map((event) =>
      String(event.user?.uid),
    ),
  );
  const userNicknames = Object.fromEntries(
    Object.entries(useVoiceSettings.getState().userNicknames).filter(([uid]) =>
      visibleUsers.has(uid),
    ),
  );
  const value = {
    giftEffectSession: output.giftEffectSession,
    giftEffectSequence: output.giftEffectSequence,
    snapshot: output.snapshot,
    ...state,
    userNicknames,
    sampleAt: output.sampleAt,
    preferences: output.sample
      ? obsSamplePreferences(preferences())
      : preferences(),
    scheme: resolveOutputScheme(scheme(), output.configurationScheme, output.query.mode),
    outputScheme: output.query.mode === "light" || output.query.mode === "dark" ? output.query.mode : output.configurationScheme,
    palette: useTheme.getState().palette,
    customColor: useTheme.getState().customColor,
    connection: output.connection,
    roomUpdates: [...output.updates.values()],
  };
  const now = output.sampleAt ?? Date.now();
  const expiryTimes = [
    ...state.sticky.map(card => card.expiresAt),
    ...(value.preferences.eventExpiry.enabled ? state.events.map(event => event.receivedAt + value.preferences.eventExpiry.seconds * 1000) : []),
  ].filter(time => time > now);
  output.nextExpiry = expiryTimes.length ? Math.min(...expiryTimes) : Infinity;
  output.dirty = false;
  if (output.batchTimer) clearTimeout(output.batchTimer);
  output.batchTimer = undefined;
  const serialized = JSON.stringify(value);
  if (!force && serialized === output.last) return;
  output.last = serialized;
  const message: ObsWireState = {
    type: "state",
    identity: output.identity,
    sequence: ++output.sequence,
    ...value,
  };
  output.clients.forEach((id) => {
    void send(id, message);
  });
}
function detach(clientId: string, clearFailure = true) {
  previewClients.delete(clientId);
  if (clearFailure && renderFailures.delete(clientId)) void publishRenderFailures();
  const current = clients.get(clientId);
  clients.delete(clientId);
  const output = current?.output;
  if (!output) return;
  output.clients.delete(clientId);
  if (!output.clients.size) output.releaseAt = Date.now() + 30_000;
}
async function attach(clientId: string, query: ObsQuery) {
  if(query.preview==="current"){detach(clientId);previewClients.set(clientId,{last:null,tail:Promise.resolve(),encode:createPreviewResourceSender()});sendCurrentPreview(clientId,true);return;}
  const previous = clients.get(clientId);
  detach(clientId, previous?.query.config !== query.config || previous?.query.theme !== query.theme);
  const current = {
    query,

    output: undefined as Output | undefined,
  };
  clients.set(clientId, current);
  try {
    const configuration = (await nativeObsConfigurationStore.load()).find(
      (c) => c.id === query.config,
    );
    if (!configuration)
      throw new Error("OBS 配置不存在，请在软件中保存配置后重新复制地址");
    if (query.mode && query.mode !== "light" && query.mode !== "dark") throw new Error("明暗参数无效，请使用 mode=light 或 mode=dark");
    const room = query.room || configuration.roomId;
    if (!room || !/^\d+$/.test(room) || Number(room) <= 0)
      throw new Error("房间号无效，请检查地址中的 room");
    let snapshot = await loadObsThemeSnapshot(configuration.id);
    if (!snapshot) throw new Error("配置尚未发布，请在软件中保存 OBS 配置");
    const sample = query.preview === "sample";
    const session = useSession.getState();
    if (!sample && (!session.session || session.phase !== "loggedIn"))
      throw new Error("软件尚未登录，请在软件中登录后重试");
    let pendingEvents: Parameters<
      ReturnType<typeof createObsOutputState>["accept"]
    >[0][] = [];
    let output: Output | undefined;
    let pendingState: ConnState | undefined;
    const pendingUpdates = new Map<string, LaplaceStateUpdate>();
    const pendingActivities: import('../events/activityLifecycle').ActivityFacts[] = [];
    const lease = sample
      ? undefined
      : await roomSessions.acquire(
          {
            roomIdInput: room,
            cookie: session.session!.cookie,
            uid: Number(session.session!.mid),
          },
          {
            onActivityUpdate: fact => {
              if (output) { output.model.acceptActivity(fact); output.dirty = true; output.batchTimer ??= setTimeout(() => publish(output!), 50); }
              else pendingActivities.push(fact);
            },
            onEvent: (event) => {
              if (output) {
                if (output.model.accept(event, Date.now()) === false) return;
                output.dirty = true;
                output.batchTimer ??= setTimeout(() => publish(output!), 50);
              } else pendingEvents.push(event);
            },
            onState: (state) => {
              if (output) {
                output.connection = state;
                publish(output);
              } else pendingState = state;
            },
            onLaplaceStateUpdate: (update) => {
              if (output) {
                output.updates.set(update.type, update);
                publish(output);
              } else pendingUpdates.set(update.type, update);
            },
          },
        );
    if (clients.get(clientId) !== current) {
      lease?.release();
      return;
    }
    const roomId = lease?.roomId ?? Number(room);
    snapshot = { ...snapshot, roomId };
    const identity = `${configuration.id}:${roomId}:${configuration.themeId}:${sample ? `sample:${query.kind ?? "混合流"}` : "live"}:${query.mode ?? configuration.scheme ?? "follow"}`;
    output = outputs.get(identity);
    if (output) {
      if (output.lease) lease?.release();
      else if (lease) {
        output.lease = lease;
        if (pendingState) output.connection = pendingState;
      }
    } else {
      output = {
        identity,
        configurationScheme: configuration.scheme ?? "follow",
        query,
        clients: new Set(),
        model: createObsOutputState(
          roomId,
          sample ? obsSamplePreferences(preferences()) : preferences(),
          outputThemePolicy({ ...snapshot, roomId }),
          (event) => {
            if (!output) return;
            const resource = getEventEffect(event);
            if (!resource) return;
            const { raw: _raw, ...cleanEvent } = event;
            const message = {
              type: "gift-effect",
              session: output.giftEffectSession,
              sequence: ++output.giftEffectSequence,
              notice: { event: cleanEvent, resource },
            };
            output.clients.forEach((id) => {
              void send(id, message);
            });
          },
        ),
        snapshot: { ...snapshot, roomId },
        connection: pendingState ?? {
          status: sample ? "connected" : "connecting",
          roomId,
        },
        updates: pendingUpdates,
        lease,
        sequence: 0,
        giftEffectSession: crypto.randomUUID(),
        giftEffectSequence: 0,
        sampleAt: sample ? Date.now() : undefined,
        sample,
        dirty: true,
        nextExpiry: Infinity,
      };
      outputs.set(identity, output);
      if (sample)
        obsSampleEvents(query.kind).forEach((event, index) =>
          output!.model.accept(
            { ...event, roomId, ts: Date.now() + index },
            Date.now(),
          ),
        );
      pendingActivities.forEach(fact => output!.model.acceptActivity(fact));
      pendingEvents.forEach((event) => output!.model.accept(event, Date.now()));
      pendingEvents = [];
    }
    current.output = output;
    output.lease?.replay();
    output.clients.add(clientId);
    output.releaseAt = undefined;
    publish(output, true);
  } catch (error) {
    if (clients.get(clientId) === current) {
      if (renderFailures.delete(clientId)) void publishRenderFailures();
      await send(clientId, {
        type: "status",
        message: error instanceof Error ? error.message : "无法读取 OBS 配置",
      });
    }
  }
}
export async function startObsHost() {
  const stopPreview=subscribePreview(()=>{for(const id of previewClients.keys())sendCurrentPreview(id);});
  const stops = await Promise.all([
    listen<{ clientId: string; query: ObsQuery }>("obs:subscribe", (event) => {
      void attach(event.payload.clientId, event.payload.query);
    }),
    listen<string>("obs:unsubscribe", (event) => detach(event.payload)),
    listen<{ clientId: string; message: { type?: string; message?: string } }>(
      "obs:client-message",
      (event) => {
        const { clientId, message } = event.payload;
        const current = clients.get(clientId);
        if (message.type === "failure") {
          renderFailures.set(clientId, {
            clientId,
            configurationId: current?.query.config,
            message:
              message.message ||
              "主题更新失败，仍在使用旧版本，请刷新浏览器输出重试",
          });
          void publishRenderFailures();
        } else if (message.type === "ready" && renderFailures.delete(clientId))
          void publishRenderFailures();
      },
    ),
    listen("obs:render-failures-request", () => {
      void publishRenderFailures();
    }),
    listen("obs:configurations-changed", async () => {
      const configurations = await nativeObsConfigurationStore.load();
      for (const [key, output] of outputs) {
        if (!output.query.config) continue;
        const configuration = configurations.find(item => item.id === output.query.config);
        if (!configuration) {
          if (output.batchTimer) clearTimeout(output.batchTimer);
          output.lease?.release();
          outputs.delete(key);
        }
      }
      for (const [id, current] of [...clients]) void attach(id, current.query);
    }),
    listen<ObsThemeSnapshot>("native-obs-theme-snapshot", (event) => {
      for (const output of outputs.values())
        if (output.query.config === event.payload.targetId) {
          output.snapshot = {
            ...event.payload,
            roomId: output.snapshot.roomId,
          };
          output.model.configure(output.sample ? obsSamplePreferences(preferences()) : preferences(), Date.now(), outputThemePolicy(output.snapshot));
          publish(output, true);
        }
    }),
  ]);
  const refreshSettings = () => {
    const now = Date.now();
    for (const output of outputs.values()) {
      output.model.configure(output.sample ? obsSamplePreferences(preferences()) : preferences(), output.sampleAt ?? now);
      publish(output);
    }
  };
  const stopGeneral = useGeneralSettings.subscribe(refreshSettings);
  const stopTheme = useTheme.subscribe(refreshSettings);
  const stopVoice = useVoiceSettings.subscribe((state, previous) => {
    if (state.userNicknames !== previous.userNicknames) refreshSettings();
  });
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", refreshSettings);
  const stopConnection = useConnection.subscribe((state, previous) => {
    if (state.events === previous.events) return;
    for (const output of outputs.values()) {
      if (!output.sample && output.dirty && output.snapshot.roomId === state.state.roomId) queueMicrotask(() => { if (output.dirty) publish(output); });
    }
  });
  const sceneValue = () => {
    try { return localStorage.getItem(SCENE_SETTINGS_KEY); } catch { return null; }
  };
  let lastScene = sceneValue();
  const timer = setInterval(() => {
    const now = Date.now();
    const scene = sceneValue();
    if (scene !== lastScene) {
      lastScene = scene;
      refreshSettings();
    }
    for (const [key, output] of outputs) {
      if (output.releaseAt && output.releaseAt <= now) {
        if (output.batchTimer) clearTimeout(output.batchTimer);
        output.lease?.release();
        outputs.delete(key);
        continue;
      }
      if (!output.sample && now >= output.nextExpiry) publish(output);
    }
  }, 200);
  const stopSession = useSession.subscribe((state) => {
    if (state.phase === "loggedIn")
      for (const [id, current] of [...clients])
        if (
          !current.output ||
          (!current.output.sample && !current.output.lease)
        )
          void attach(id, current.query);
    if (state.phase === "loggedOut")
      for (const output of outputs.values())
        if (!output.sample) {
          output.lease?.release();
          output.lease = undefined;
          output.connection = {
            status: "error",
            message: "登录已失效，请在软件中重新登录",
          };
          publish(output);
        }
  });
  await invoke("obs_start_service").catch(() => undefined);
  return () => {
    clearInterval(timer);
    stopGeneral();
    stopTheme();
    stopVoice();
    stopConnection();
    media.removeEventListener("change", refreshSettings);
    stopPreview();previewClients.clear();
    stopSession();
    stops.forEach((stop) => stop());
    outputs.forEach((output) => {
      if (output.batchTimer) clearTimeout(output.batchTimer);
      output.lease?.release();
    });
    outputs.clear();
    clients.clear();
  };
}
