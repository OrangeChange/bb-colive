export interface NativeTextFilterFacts { isDanmu: boolean; isAutoDanmaku?: boolean; phoneVerified?: boolean }
export interface NativeTextFilters { showAutoDanmaku: boolean; showPhoneNotVerified: boolean }
export interface NativeTextFilterRecord { source?: { nativeTextFilterFacts?: unknown } }
export function shouldShowAutoDanmakuFacts(facts: NativeTextFilterFacts, show: boolean): boolean;
export function shouldShowPhoneNotVerifiedFacts(facts: NativeTextFilterFacts, show: boolean): boolean;
export function assertNativeTextFilters(value: unknown): asserts value is NativeTextFilters;
export function readNativeTextFilterFacts(record: NativeTextFilterRecord | undefined): NativeTextFilterFacts | null | undefined;
export function evaluateNativeTextFilters(record: NativeTextFilterRecord | undefined, filters: NativeTextFilters): { allowed: boolean; invalid: boolean; auto: boolean; phone: boolean };
