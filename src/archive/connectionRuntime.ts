const RUNTIME_KEY = Symbol.for("bb-colive.connection-runtime");

interface Disconnectable {
  disconnect(): void;
}

interface Closeable {
  close(): void | Promise<unknown>;
  setRuntimeContext?(runtimeId: string, generation: number): void;
}

interface RuntimeRegistry {
  runtimeId: string;
  nextGeneration: number;
  active: ConnectionRuntime | null;
  archiveWriter: Closeable | null;
  archiveClose: Promise<unknown> | null;
}

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_KEY]?: RuntimeRegistry;
};

const runtimeGlobal = globalThis as RuntimeGlobal;

function getRegistry(): RuntimeRegistry {
  return runtimeGlobal[RUNTIME_KEY] ??= {
    runtimeId: `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nextGeneration: 0,
    active: null,
    archiveWriter: null,
    archiveClose: null,
  };
}

export class ConnectionRuntime {
  readonly generation: number;
  readonly runtimeId: string;
  private active = true;
  private connection: Disconnectable | null = null;
  private archiveWriter: Closeable | null = null;
  private stopTimer: (() => void) | null = null;
  private cleanups: (() => void)[] = [];
  private disposal: Promise<void> | null = null;

  constructor(private readonly registry: RuntimeRegistry) {
    this.generation = ++registry.nextGeneration;
    this.runtimeId = registry.runtimeId;
  }

  isCurrent(): boolean {
    return this.active && this.registry.active === this;
  }

  guard<T extends (...args: any[]) => any>(callback: T): T {
    return ((...args: Parameters<T>) => {
      if (!this.isCurrent()) return undefined;
      return callback(...args);
    }) as T;
  }

  setConnection(connection: Disconnectable | null): void {
    if (this.connection && this.connection !== connection) this.connection.disconnect();
    this.connection = connection;
  }

  getArchiveWriter<T extends Closeable>(): T | null {
    const writer = this.registry.archiveWriter as T | null;
    writer?.setRuntimeContext?.(this.runtimeId, this.generation);
    return writer;
  }

  setArchiveWriter<T extends Closeable>(writer: T | null): T | null {
    if (writer === null) return this.registry.archiveWriter as T | null;
    this.registry.archiveWriter ??= writer;
    this.archiveWriter = this.registry.archiveWriter;
    this.archiveWriter.setRuntimeContext?.(this.runtimeId, this.generation);
    return this.registry.archiveWriter as T;
  }

  async closeArchiveWriter(): Promise<unknown> {
    if (this.registry.archiveClose) return this.registry.archiveClose;
    const writer = this.registry.archiveWriter;
    if (!writer) return undefined;
    let closing!: Promise<unknown>;
    closing = (async () => {
      try {
        return await writer.close();
      } finally {
        if (this.registry.archiveWriter === writer) this.registry.archiveWriter = null;
        if (this.registry.archiveClose === closing) this.registry.archiveClose = null;
      }
    })();
    this.registry.archiveClose = closing;
    return closing;
  }

  setTimer(stop: (() => void) | null): void {
    this.stopTimer?.();
    this.stopTimer = stop;
  }

  addCleanup(cleanup: () => void): () => void {
    this.cleanups.push(cleanup);
    return () => {
      const index = this.cleanups.indexOf(cleanup);
      if (index >= 0) this.cleanups.splice(index, 1);
    };
  }

  dispose(reason = "dispose"): Promise<void> {
    if (!this.active) return this.disposal ?? Promise.resolve();
    this.active = false;
    if (this.registry.active === this) this.registry.active = null;

    const connection = this.connection;
    this.connection = null;
    try { connection?.disconnect(); } catch { /* cleanup must continue */ }

    const stopTimer = this.stopTimer;
    this.stopTimer = null;
    try { stopTimer?.(); } catch { /* cleanup must continue */ }

    const cleanups = this.cleanups.splice(0);
    for (const cleanup of cleanups) {
      try { cleanup(); } catch { /* cleanup must continue */ }
    }

    this.disposal = reason === "shutdown"
      ? this.closeArchiveWriter().then(() => undefined)
      : Promise.resolve();
    return this.disposal;
  }
}

export function claimConnectionRuntime(): ConnectionRuntime {
  const registry = getRegistry();
  void registry.active?.dispose("replaced");
  const runtime = new ConnectionRuntime(registry);
  registry.active = runtime;
  return runtime;
}

export function getConnectionRuntime(): ConnectionRuntime | null {
  return getRegistry().active;
}
