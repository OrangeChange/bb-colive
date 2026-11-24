/** 姓名仅在输出显示边界转换，原始身份不变。 */
const firstCharacter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function maskDisplayName(name: string): string {
  if (!name) return name;
  return firstCharacter.segment(name)[Symbol.iterator]().next().value!.segment + "***";
}

export function maskExistingNames<T extends Record<string, any>>(value: T): T {
  const result = { ...value };
  for (const key of ["uname", "username", "authorName"] as const) {
    if (typeof value[key] === "string") (result as Record<string, unknown>)[key] = maskDisplayName(value[key]);
  }
  return result;
}

export function maskLaplaceNames<T extends Record<string, any>>(event: T): T {
  const result: Record<string, any> = maskExistingNames(event);
  for (const key of ["reply", "receiver"]) {
    if (event[key] && typeof event[key] === "object") result[key] = maskExistingNames(event[key]);
  }
  if (Array.isArray(event.list)) result.list = event.list.map((entry: any) => Array.isArray(entry)
    ? entry.map((value, index) => index === 1 && typeof value === "string" ? maskDisplayName(value) : value)
    : entry && typeof entry === "object" ? maskExistingNames(entry) : entry);
  return result as T;
}

export function projectCallbackNames<T extends { payload?: Record<string, any>; data?: Record<string, any> }>(record: T, masked: boolean): T {
  if (!masked) return record;
  return { ...record, ...(record.payload ? { payload: maskExistingNames(record.payload) } : {}), ...(record.data ? { data: maskExistingNames(record.data) } : {}) };
}

export function projectSourceNameFrame<T extends { records?: unknown[]; presentation?: { messages: unknown[]; paidMessages: unknown[] } }>(frame: T, masked: boolean): T {
  const records = frame.records as Array<{ payload?: Record<string, any>; data?: Record<string, any> }> | undefined;
  const names = new Map(records?.flatMap(record => {
    const data = record.payload ?? record.data;
    return data && typeof data.authorName === "string" ? [[String(data.id), data.authorName] as const] : [];
  }));
  const project = (value: unknown) => {
    const message = value as Record<string, any>;
    const name = names.get(String(message.id)) ?? message.authorName;
    return typeof name === "string" ? { ...message, authorName: masked ? maskDisplayName(name) : name } : message;
  };
  return { ...frame,
    ...(records ? { records: records.map(record => projectCallbackNames(record, masked)) } : {}),
    ...(frame.presentation ? { presentation: {
      messages: frame.presentation.messages.map(project), paidMessages: frame.presentation.paidMessages.map(project),
    } } : {}),
  };
}
