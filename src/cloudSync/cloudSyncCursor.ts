const MAX_CURSOR = 9223372036854775807n;

export function validateCloudCursor(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 19 || BigInt(value) > MAX_CURSOR) {
    throw new Error('服务器返回的进度无效，请检查服务器版本');
  }
}

export function compareCloudCursor(a: string, b: string): -1 | 0 | 1 {
  validateCloudCursor(a);
  validateCloudCursor(b);
  const left = BigInt(a), right = BigInt(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function validateCloudRoomId(value: string): void {
  validateCloudCursor(value);
  if (value === '0') throw new Error('房间号无效，请检查房间配置');
}
