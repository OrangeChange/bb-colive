/** Original pinned Laplace renderer schema. Additional keys are event-specific
 * renderer facts, never a transport packet, credentials, or arbitrary raw data. */
export interface LaplaceEvent {
  type: string;
  id: string;
  origin: number;
  originIdx: number;
  uid: string | number;
  username?: string;
  timestamp: number;
  timestampNormalized: number;
  duration?: number;
  price?: number;
  priceNormalized?: number;
  guardType?: number;
  deleted?: boolean;
  [key: string]: any;
}
export type LaplaceProjectionMode = 'live' | 'static' | 'design' | 'simulation';
export type LaplaceTimestampUnit = 'seconds' | 'milliseconds' | 'nanoseconds' | 'receipt-milliseconds';
export interface LaplaceActivityFact {
  kind: 'lottery' | 'redEnvelope'; phase: 'start' | 'end'; id: string;
}
export interface LaplaceActivityState {
  kind: LaplaceActivityFact['kind']; phase: LaplaceActivityFact['phase']; identity: string;
  /** Host-derived, retained-record-only terminal evidence. Never renderer data. */
  terminal: boolean;
}
export interface LaplaceSourceMetadata {
  activity?: LaplaceActivityFact;
  sourceCommand: string;
  sourceMode: 'direct' | 'open' | 'canonical';
  platform: 'bilibili';
  rawOpenID?: string;
  rawReplyOpenID?: string;
  trueUid?: string;
  /** Open DM supplies no observed phone-verification fact. */
  sourcePhoneVerification?: 'unknown';
  /** The renderer flag is a pinned upstream convention, not user verification. */
  phoneVerifiedProvenance?: 'upstream-normalizer-constant';
  timestampUnit: LaplaceTimestampUnit;
  timestampFallback: boolean;
  /** Compatibility-only normalized fields. Guard ranks already use Laplace wire semantics. */
  event?: LaplaceEvent;
  deleteIds?: string[];
  unavailableFields?: string[];
}
export interface LaplaceInputScope { roomId: number; generation: number }
export interface LaplaceNativePaidStickyFact {
  kind: 'gift' | 'guard'; amountRmb: number | null; key: string;
  roomId: number; generation: number; sourceMode: LaplaceSourceMetadata['sourceMode'];
}
export interface LaplaceNativeGuardEntryDecision {
  kind: 'entry'; allowedWhenEnabled: boolean; roomId: number; generation: number;
  sourceMode: LaplaceSourceMetadata['sourceMode']; sourceCommand: string; sourceEventId: string;
}
export interface LaplaceInputRecord {
  event: LaplaceEvent;
  source: {
    platform: string;
    sourceMode: LaplaceSourceMetadata['sourceMode'];
    sourceCommand: string;
    sourceEventId: string;
    userIdentity: string;
    rawOpenID?: string;
    sourcePhoneVerification?: LaplaceSourceMetadata['sourcePhoneVerification'];
    phoneVerifiedProvenance?: LaplaceSourceMetadata['phoneVerifiedProvenance'];
    scIdentity?: string;
    /** Canonical host-only payment authority; null is present-invalid, never legacy. */
    nativePaidSticky?: LaplaceNativePaidStickyFact | null;
    /** Canonical entry decision only; null is present-invalid, never legacy. */
    nativeGuardEntryDecision?: LaplaceNativeGuardEntryDecision | null;
    activity?: LaplaceActivityState;
    /** Canonical Danmu observations only, never normalized renderer constants. */
    nativeTextFilterFacts?: { isDanmu: true; isAutoDanmaku?: boolean; phoneVerified?: boolean };
    timestampUnit: LaplaceTimestampUnit;
    timestampFallback: boolean;
    unavailableFields?: string[];
  };
  receivedAt: number;
  sequence: number;
}
export interface LaplaceRetentionPolicy {
  maxRecords: number;
  maxBytes: number;
  maxAgeMs: number;
}
export interface LaplaceRetentionStatus {
  configured: boolean;
  policy: LaplaceRetentionPolicy | null;
  retainedBytes: number;
  evictedRecords: number;
  rejectedOversizeRecords: number;
}
export interface LaplaceInputSnapshot {
  roomId: number | null;
  generation: number;
  revision: number;
  records: LaplaceInputRecord[];
  retention: LaplaceRetentionStatus;
}
export type LaplaceInputNotification =
  | { type: 'reset'; snapshot: LaplaceInputSnapshot }
  | ({ type: 'batch' | 'retention'; removedSequences: number[] } & LaplaceInputSnapshot);
/** Only options consulted by host admission/projection; rendering consumes the
 * independently validated complete settings object. */
export interface LaplaceAdmissionSettings {
  hostPaidFilter?: boolean; hostPaidThreshold?: number; hostPaidMode?: "unit" | "cumulative";
  showDanmaku?: boolean; showGift?: boolean; showSuperChat?: boolean; showToast?: boolean;
  showRedEnvelop?: boolean; showLottery?: boolean; showSystemMessage?: boolean;
  showEnterEvent?: boolean; showFollowEvent?: boolean; showPhoneNotVerified?: boolean;
  showAutoDanmaku?: boolean; showGiftFree?: boolean; showEnterEventCurrentGuardOnly?: boolean;
  showGiftPriceAbove?: number; showGiftStickyAbove?: number;
  showStickyBar?: boolean; limitEventAmount?: number; limitStickyAmount?: number;
}
