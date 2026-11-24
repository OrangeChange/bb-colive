import { uiText } from "../i18n/index.ts";
import type {
  ConnectParams,
  ConnectionCallbacks,
  AnchorInfo,
} from "../protocol/connection.ts";
import { MsgType, type ConnState } from "../protocol/types.ts";
import type { RoomInitData } from "../protocol/api.ts";
import type { LaplaceStateUpdate } from "../protocol/laplaceCompatibility.ts";
import { activityEventKey, createActivityLifecycle } from '../events/activityLifecycle.ts';
export interface RoomConnection {
  connect(params: ConnectParams): Promise<void>;
  disconnect(): void;
  readonly anchor: AnchorInfo | null;
  readonly isConnected: boolean;
  readonly diagnosticConnectionId?: string;
  readonly liveStatusRevision: number;
  reconcileLiveStatus(room: RoomInitData, revision: number): boolean;
}
export function createRoomSessions(ports: {
  resolveRoom(input: string, cookie: string): Promise<number>;
  create(callbacks: ConnectionCallbacks): RoomConnection;
}) {
  type Entry = {
    connection: RoomConnection;
    callbacks: Set<ConnectionCallbacks>;
    state?: ConnState;
    updates: Map<string, LaplaceStateUpdate>;
    activities: ReturnType<typeof createActivityLifecycle>;
    ready: Promise<void>;
    failed: boolean;
  };
  const rooms = new Map<number, Entry>();
  const connect = (entry: Entry, params: ConnectParams, roomId: number) => {
    entry.failed = false;
    entry.ready = entry.connection
      .connect({ ...params, roomIdInput: String(roomId) })
      .catch((error) => {
        entry.failed = true;
        entry.state = {
          status: "error",
          roomId,
          message: error instanceof Error ? (error as Error & { friendly?: string }).friendly ?? error.message : uiText("obsRoomSessions.createRoomSessions.connect.message"),
        };
        entry.callbacks.forEach((cb) => cb.onState(entry.state!));
      });
  };
  return {
    async acquire(params: ConnectParams, callbacks: ConnectionCallbacks, onConnection?: (connection: RoomConnection) => void) {
      const roomId = await ports.resolveRoom(params.roomIdInput, params.cookie);
      let entry = rooms.get(roomId);
      if (!entry) {
        const subscribers = new Set([callbacks]);
        const current = {} as Entry;
        const activities = createActivityLifecycle();
        const connection = ports.create({
          onEvent: (event) => {
            if (current.state && (event.msgType === MsgType.LiveStart || event.msgType === MsgType.LiveEnd)) {
              current.state = { ...current.state,
                liveStatus: event.msgType === MsgType.LiveStart ? 1 : 0,
                ...(event.msgType === MsgType.LiveStart ? { liveStartedAt: event.liveIdentity?.sourceLiveStartedAt } : {}) };
            }
            const key = activityEventKey(event);
            const before = key ? activities.get(key) : undefined;
            const fact = activities.accept(event);
            if (fact && before !== fact) subscribers.forEach(cb => cb.onActivityUpdate?.(fact));
            const projected = activities.project(event);
            subscribers.forEach((cb) => cb.onEvent(projected));
          },
          onActivityUpdate: fact => {
            const previous = activities.get(`${fact.roomId}:${fact.kind}:${fact.activityId}`);
            const next = activities.acceptFact(fact);
            if (next !== previous) subscribers.forEach(cb => cb.onActivityUpdate?.(next));
          },
          onState: (state) => {
            current.state = { ...current.state, ...state };
            subscribers.forEach((cb) => cb.onState(current.state!));
          },
          onLaplaceStateUpdate: (update) => {
            current.updates.set(update.type, update);
            subscribers.forEach((cb) => cb.onLaplaceStateUpdate?.(update));
          },
        });
        Object.assign(current, {
          connection,
          callbacks: subscribers,
          updates: new Map(),
          activities,
          ready: Promise.resolve(),
          failed: false,
        });
        entry = current;
        rooms.set(roomId, current);
        onConnection?.(connection);
        connect(current, params, roomId);
      } else {
        entry.callbacks.add(callbacks);
        onConnection?.(entry.connection);
        if (entry.failed) {
          entry.connection.disconnect();
          connect(entry, params, roomId);
        }
      }
      let released = false;
      const owned = entry;
      return {
        roomId,
        connection: entry.connection,
        ready: entry.ready,
        replay() {
          owned.activities.snapshot().forEach(fact => callbacks.onActivityUpdate?.(fact));
          if (owned.state) callbacks.onState(owned.state);
          owned.updates.forEach((update) =>
            callbacks.onLaplaceStateUpdate?.(update),
          );
        },
        release() {
          if (released) return;
          released = true;
          owned.callbacks.delete(callbacks);
          if (!owned.callbacks.size) {
            owned.connection.disconnect();
            if (rooms.get(roomId) === owned) rooms.delete(roomId);
          }
        },
      };
    },
    inspect() {
      return [...rooms].map(([roomId, entry]) => ({
        roomId,
        subscribers: entry.callbacks.size,
        status: entry.state?.status,
      }));
    },
  };
}
