import type { DanmakuEvent } from "../protocol/types.ts";
import type {
  ArchiveEventRecord,
  ArchiveFilterState,
  ArchiveSessionQuery,
  ArchiveSessionSummary,
} from "./archiveTypes.ts";
import type { ArchiveProjectedEvent } from "./archiveProjection.ts";

export type ArchiveDataExportCategory = "danmaku" | "interaction" | "gift" | "superchat" | "guard";
export type ArchiveDataExportFormat = "excel" | "csv" | "ai-json";

export type ArchiveDataExportScope =
  | { kind: "session"; sessionId: string; filters?: ArchiveFilterState }
  | { kind: "sessions"; sessionIds: readonly string[]; filters?: ArchiveFilterState }
  | { kind: "owner"; ownerId: string; sessionQuery?: ArchiveSessionQuery; filters?: ArchiveFilterState }
  | { kind: "all"; filters?: ArchiveFilterState };

export interface ArchiveDataExportCommonRow {
  "场次ID": string;
  "事件时间": string;
  "用户UID": string | null;
  "用户名": string | null;
  "粉丝牌": string | null;
  "荣耀等级": number | null;
  "大航海身份": "舰长" | "提督" | "总督" | null;
}

export type ArchiveDataExportRow = ArchiveDataExportCommonRow & Record<string, unknown>;

export interface ArchiveDataExportItem {
  category: ArchiveDataExportCategory;
  sessionId: string;
  eventTs: number;
  ordinal: number;
  eventKey: string;
  row: ArchiveDataExportRow;
}

export interface ArchiveDataExportStats {
  eventCount: number;
  uniqueUserCount: number;
  quantity: number | null;
  value: number | null;
  amount: number | null;
}

export type ArchiveDataExportSummaryKey =
  | "danmaku"
  | "interaction"
  | "normalGift"
  | "blindGift"
  | "redPocket"
  | "superchat"
  | "guard"
  | "captain"
  | "admiral"
  | "viceroy";

export interface ArchiveDataExportSummaryBlock {
  session: ArchiveSessionSummary;
  stats: Record<ArchiveDataExportSummaryKey, ArchiveDataExportStats>;
  exportedEventCount: number;
}

export interface ArchiveDataExportSnapshot {
  sessions: ArchiveSessionSummary[];
  records: ArchiveEventRecord[];
}

export interface ArchiveDataExportProgress {
  phase: "sessions" | "events";
  completed: number;
  total: number;
  sessionId?: string;
  eventCount?: number;
}

export interface ArchiveDataExportCollectionOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ArchiveDataExportProgress) => void;
}

export interface ArchiveDataExportBundle {
  scope: ArchiveDataExportScope;
  sessions: ArchiveSessionSummary[];
  items: ArchiveDataExportItem[];
  rowsByCategory: Record<ArchiveDataExportCategory, ArchiveDataExportRow[]>;
  summary: ArchiveDataExportSummaryBlock[];
}

export type ArchiveDataExportProjectedInput = ArchiveProjectedEvent & { event: DanmakuEvent };
