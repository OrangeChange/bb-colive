import type { IssueMarker, IssueMarkerStatus } from "./diagnosticTypes.ts";
import { sanitizeDiagnosticString } from "./diagnosticLogger.ts";

const BEFORE_MARK_MS = 120_000;
const AFTER_MARK_MS = 180_000;
const REDACTED_VALUE = "[redacted]";

function sanitizeNote(note: string | undefined): string | undefined {
  const value = sanitizeDiagnosticString(note)?.trim();
  if (!value) return undefined;
  return value;
}

function requiredDiagnosticString(value: string): string {
  return sanitizeDiagnosticString(value) ?? REDACTED_VALUE;
}

function sanitizeOptionalString(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeDiagnosticString(value);
}

function sanitizeOptionalRelation(value: string | number | undefined): string | number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return sanitizeDiagnosticString(value);
}

export function createIssueMarker(input: {
  id: string;
  markedAt: number;
  note?: string;
  sessionId: string;
  connectionId?: string;
  roomId?: string | number;
}): IssueMarker {
  const note = sanitizeNote(input.note);
  const connectionId = sanitizeOptionalString(input.connectionId);
  const roomId = sanitizeOptionalRelation(input.roomId);
  return {
    id: requiredDiagnosticString(input.id),
    markedAt: input.markedAt,
    ...(note === undefined ? {} : { note }),
    sessionId: requiredDiagnosticString(input.sessionId),
    ...(connectionId === undefined ? {} : { connectionId }),
    ...(roomId === undefined ? {} : { roomId }),
  };
}

export function getIssueMarkerWindow(marker: IssueMarker): { start: number; end: number } {
  return {
    start: marker.markedAt - BEFORE_MARK_MS,
    end: marker.markedAt + AFTER_MARK_MS,
  };
}

export function getIssueMarkerStatus(marker: IssueMarker, now: number): IssueMarkerStatus {
  return now >= getIssueMarkerWindow(marker).end ? "complete" : "collecting";
}
