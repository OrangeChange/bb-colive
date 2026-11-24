import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  DiagnosticStreamLogger,
  getDiagnosticContext,
  getDiagnosticConnectionId,
  type DiagnosticContext,
  type DiagnosticStreamLoggerDependencies,
} from "./diagnosticLogger.ts";

export interface SourceDiagnosticInput {
  cmd: string;
  data: unknown;
  connectionId?: string;
  roomId?: string | number;
}

export interface SourceFeatureDiagnosticInput {
  featureId: string;
  stage: string;
  action: string;
  outcome: string;
  sessionId?: string;
  eventId?: string;
  connectionId?: string;
  roomId?: string | number;
  data?: Record<string, string | number | boolean | null>;
}

export type SourceDiagnosticLoggerDependencies = Omit<DiagnosticStreamLoggerDependencies, "stream">;

export class SourceDiagnosticLogger {
  private readonly logger: DiagnosticStreamLogger;

  constructor(dependencies: SourceDiagnosticLoggerDependencies = {}) {
    this.logger = new DiagnosticStreamLogger({ ...dependencies, stream: "source", invoke: dependencies.invoke ?? tauriInvoke });
  }

  record(input: SourceDiagnosticInput, context: DiagnosticContext = getDiagnosticContext()): string {
    return this.logger.record({
      connectionId: input.connectionId ?? getDiagnosticConnectionId(context),
      roomId: input.roomId,
      record: { cmd: input.cmd, data: input.data },
    });
  }

  recordFeature(input: SourceFeatureDiagnosticInput, context: DiagnosticContext = getDiagnosticContext()): string {
    return this.logger.record({
      sessionId: input.sessionId,
      connectionId: input.connectionId ?? getDiagnosticConnectionId(context),
      roomId: input.roomId,
      eventId: input.eventId,
      record: {
        featureId: input.featureId,
        stage: input.stage,
        action: input.action,
        outcome: input.outcome,
        ...(input.data === undefined ? {} : input.data),
      },
    });
  }

  flush() { return this.logger.flush(); }
  getHealthSnapshot() { return this.logger.getHealthSnapshot(); }
  stop() { this.logger.stop(); }
}

export function createSourceDiagnosticLogger(dependencies: SourceDiagnosticLoggerDependencies = {}): SourceDiagnosticLogger {
  return new SourceDiagnosticLogger(dependencies);
}

export const sourceDiagnosticLogger = createSourceDiagnosticLogger();
