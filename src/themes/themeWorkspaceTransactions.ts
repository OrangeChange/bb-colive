import { uiText, UiMessageError } from "../i18n/index.ts";
export interface ObsConfigurationTransaction<T extends { id: string }> {
  previous?: T;
  next: T;
  save(configuration: T): Promise<void>;
  remove(id: string): Promise<void>;
  publish(): Promise<void>;
}

export interface ThemePublicationTransaction<TSnapshot, TBinding> {
  nextSnapshot: TSnapshot;
  previousBinding?: TBinding;
  nextBinding: TBinding;
  loadSnapshot(): Promise<TSnapshot | undefined>;
  saveSnapshot(snapshot: TSnapshot): Promise<void>;
  removeSnapshot?(): Promise<void>;
  saveBinding(binding: TBinding): Promise<void>;
  removeBinding?(): Promise<void>;
  publish(snapshot: TSnapshot): Promise<void>;
  removeOutput?(): Promise<void>;
  restoreOutput?(snapshot: TSnapshot | undefined): Promise<void>;
}

export async function commitThemePublication<TSnapshot, TBinding>(transaction: ThemePublicationTransaction<TSnapshot, TBinding>): Promise<void> {
  const previousSnapshot = await transaction.loadSnapshot();
  try {
    await transaction.saveSnapshot(transaction.nextSnapshot);
    await transaction.saveBinding(transaction.nextBinding);
    await transaction.publish(transaction.nextSnapshot);
  } catch (cause) {
    const rollbackErrors: ThemeRollbackErrors = {};
    const restored = { snapshot: false, binding: false, output: false };
    const settle = async (key: keyof ThemeRollbackState, operation: () => Promise<void>) => {
      try { await operation(); restored[key] = true; }
      catch (error) { rollbackErrors[key] = error; }
    };
    await Promise.all([
      settle("snapshot", async () => { if (previousSnapshot) await transaction.saveSnapshot(previousSnapshot); else await transaction.removeSnapshot?.(); }),
      settle("binding", async () => { if (transaction.previousBinding) await transaction.saveBinding(transaction.previousBinding); else await transaction.removeBinding?.(); }),
      settle("output", async () => {
        const errors = [];
        try { await transaction.removeOutput?.(); } catch (error) { errors.push(error); }
        try { if (transaction.restoreOutput) await transaction.restoreOutput(previousSnapshot); else if (previousSnapshot) await transaction.publish(previousSnapshot); } catch (error) { errors.push(error); }
        if (errors.length) throw new ThemeOutputRollbackError(errors);
      }),
    ]);
    throw new ThemePublicationError(uiText("themeWorkspaceTransactions.commitThemePublication", { value: String(cause) }), restored, rollbackErrors, cause);
  }
}

export interface ThemeRollbackState { snapshot: boolean; binding: boolean; output: boolean }
export type ThemeRollbackErrors = Partial<Record<keyof ThemeRollbackState, unknown>>;
export class ThemeOutputRollbackError extends Error {
  constructor(readonly errors: unknown[]) { super(uiText("themeWorkspaceTransactions.text")); this.name = "ThemeOutputRollbackError"; }
}
export class ThemePublicationError extends Error {
  constructor(message: string, readonly restored: ThemeRollbackState, readonly rollbackErrors: ThemeRollbackErrors, readonly cause: unknown) {
    super(message); this.name = "ThemePublicationError";
  }
}

export async function commitThemeRemoval(transaction: {
  removeSnapshot(): Promise<void>;
  removeBinding(): Promise<void>;
  removeOutput(): Promise<void>;
  restoreSnapshot(): Promise<void>;
  restoreBinding(): Promise<void>;
  restoreOutput(): Promise<void>;
}): Promise<() => Promise<void>> {
  const restore = async () => {
    const results = await Promise.allSettled([
      transaction.restoreSnapshot(),
      transaction.restoreBinding(),
      transaction.restoreOutput(),
    ]);
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
  try {
    await transaction.removeSnapshot();
    await transaction.removeBinding();
    await transaction.removeOutput();
  } catch (cause) {
    try {
      await restore();
    } catch (rollbackCause) {
      throw new ThemeRemovalError(uiText("themeWorkspaceTransactions.commitThemeRemoval", { value: String(cause), value2: String(rollbackCause) }), false, cause);
    }
    throw new ThemeRemovalError(uiText("themeWorkspaceTransactions.commitThemeRemoval2", { value: String(cause) }), true, cause);
  }
  return restore;
}

export class ThemeRemovalError extends Error {
  readonly cause: unknown;
  constructor(message: string, readonly restored: boolean, cause?: unknown) {
    super(message);
    this.name = "ThemeRemovalError";
    this.cause = cause;
  }
}

export async function commitObsConfiguration<T extends { id: string }>(transaction: ObsConfigurationTransaction<T>): Promise<void> {
  await transaction.save(transaction.next);
  try {
    await transaction.publish();
  } catch (cause) {
    try {
      if (transaction.previous) await transaction.save(transaction.previous);
      else await transaction.remove(transaction.next.id);
    } catch (rollbackCause) {
      throw new Error(uiText("themeWorkspaceTransactions.commitObsConfiguration", { value: String(cause), value2: String(rollbackCause) }));
    }
    throw cause;
  }
}

export async function deleteObsConfiguration(transaction: {
  cleanupPublished(): Promise<() => Promise<void>>;
  removeConfiguration(): Promise<void>;
}): Promise<void> {
  let restore: () => Promise<void>;
  try {
    restore = await transaction.cleanupPublished();
  } catch (cause) {
    const restored = cause instanceof Error && "restored" in cause && typeof cause.restored === "boolean" ? cause.restored : false;
    throw new ObsConfigurationDeleteError(
      restored ? uiText("themeWorkspaceTransactions.deleteObsConfiguration", { value: String(cause) }) : uiText("themeWorkspaceTransactions.deleteObsConfiguration2", { value: String(cause) }),
      restored,
      cause,
    );
  }
  try {
    await transaction.removeConfiguration();
  } catch (cause) {
    try {
      await restore();
    } catch (rollbackCause) {
      throw new ObsConfigurationDeleteError(uiText("themeWorkspaceTransactions.deleteObsConfiguration3", { value: String(cause), value2: String(rollbackCause) }), false, cause);
    }
    throw new ObsConfigurationDeleteError(uiText("themeWorkspaceTransactions.deleteObsConfiguration", { value: String(cause) }), true, cause);
  }
}

export class ObsConfigurationDeleteError extends Error {
  readonly cause: unknown;
  constructor(message: string, readonly restored: boolean, options?: unknown) {
    super(message);
    this.name = "ObsConfigurationDeleteError";
    this.cause = options;
  }
}

export function themeSaveErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof UiMessageError && cause.messageKey === "backend.theme_store.program_style_write_error" ? cause.message : fallback;
}
