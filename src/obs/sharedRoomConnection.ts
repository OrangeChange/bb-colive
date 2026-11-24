import {
  DanmuConnection,
  type ConnectParams,
  type ConnectionCallbacks,
  type AnchorInfo,
} from "../protocol/connection.ts";
import { getRealRoomId, type RoomInitData } from "../protocol/api.ts";
import { createRoomSessions, type RoomConnection } from "./obsRoomSessions.ts";
export const roomSessions = createRoomSessions({
  resolveRoom: async (input, cookie) =>
    (await getRealRoomId(input, cookie)).room_id,
  create: (callbacks) => new DanmuConnection(callbacks),
});
export class SharedRoomConnection {
  private lease: Awaited<ReturnType<typeof roomSessions.acquire>> | undefined;
  private generation = 0;
  private source: RoomConnection | undefined;
  private roomInput = "";
  constructor(
    private callbacks: ConnectionCallbacks,
    ..._diagnostics: unknown[]
  ) {}
  get anchor(): AnchorInfo | null {
    const anchor = this.lease?.connection.anchor;
    return anchor ? { ...anchor, roomIdInput: this.roomInput } : null;
  }
  get diagnosticConnectionId(): string | undefined {
    return this.source?.diagnosticConnectionId;
  }
  get isConnected() {
    return this.lease?.connection.isConnected ?? false;
  }
  get liveStatusRevision() {
    return this.source?.liveStatusRevision ?? 0;
  }
  reconcileLiveStatus(room: RoomInitData, revision: number): boolean {
    return this.source?.reconcileLiveStatus(room, revision) ?? false;
  }
  async connect(params: ConnectParams) {
    this.disconnect();
    this.roomInput = params.roomIdInput;
    const generation = this.generation;
    try {
      const lease = await roomSessions.acquire(params, {
        ...this.callbacks,
        onState: (state) => {
          if (generation === this.generation)
            this.callbacks.onState({
              ...state,
              roomIdInput: params.roomIdInput,
            });
        },
        onEvent: (event) => {
          if (generation === this.generation) this.callbacks.onEvent(event);
        },
        onActivityUpdate: fact => {
          if (generation === this.generation) this.callbacks.onActivityUpdate?.(fact);
        },
        onLaplaceStateUpdate: (update) => {
          if (generation === this.generation)
            this.callbacks.onLaplaceStateUpdate?.(update);
        },
      }, (connection) => {
        if (generation === this.generation) this.source = connection;
      });
      if (generation !== this.generation) {
        lease.release();
        return;
      }
      this.lease = lease;
      lease.replay();
      await lease.ready;
    } catch (error) {
      if (generation === this.generation)
        this.callbacks.onState({
          status: "error",
          message: error instanceof Error ? (error as Error & { friendly?: string }).friendly ?? error.message : "无法连接直播间",
        });
      throw error;
    }
  }
  disconnect() {
    this.generation++;
    this.lease?.release();
    this.lease = undefined;
    this.source = undefined;
  }
}
