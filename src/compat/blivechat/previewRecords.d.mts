export interface BlivechatPreviewRecord {
  method?: unknown;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export function prepareBlivechatPreviewRecord(record: BlivechatPreviewRecord): BlivechatPreviewRecord | null;
export function prepareBlivechatPreviewRecords(records: readonly BlivechatPreviewRecord[]): BlivechatPreviewRecord[];
export function blivechatPreviewMethodForEvent(eventType?: string): string | null;
export function filterBlivechatPreviewRecords(records: readonly BlivechatPreviewRecord[], displayAll: boolean, eventType?: string): BlivechatPreviewRecord[];
export function createBlivechatFixedPreviewRecords(mode: "blivechat" | "blivechat-open", previewMode?: string): BlivechatPreviewRecord[];

export function orderBlivechatDesignRecords<T extends BlivechatPreviewRecord>(records: readonly T[]): T[];
