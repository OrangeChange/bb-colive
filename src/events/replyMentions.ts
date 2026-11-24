export type ReplyMentionTarget = {
  uname?: string;
};

export type ReplyMentionMatch = {
  start: number;
  end: number;
  label: string;
};

export type ReplyMentionResolution = {
  label: string;
  match: ReplyMentionMatch | null;
  prepend: boolean;
};

const isNameCharacter = (value: string) => /[\p{L}\p{N}_-]/u.test(value);
const isAsciiAddressCharacter = (value: string) => /[A-Za-z0-9._%+\-]/u.test(value);

/** 只匹配有结构化 reply 目标的完整 @用户名，避免链接邮箱或用户名前缀。 */
export function findReplyMention(text: string, target?: ReplyMentionTarget): ReplyMentionMatch | null {
  const uname = target?.uname?.trim();
  if (!uname || !text) return null;

  const label = `@${uname}`;
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(label, from);
    if (start < 0) return null;
    const before = start > 0 ? text[start - 1] : "";
    const after = text[start + label.length] ?? "";
    if ((!before || !isAsciiAddressCharacter(before)) && (!after || !isNameCharacter(after))) {
      return { start, end: start + label.length, label };
    }
    from = start + 1;
  }
  return null;
}

/**
 * 解析结构化回复目标在正文中的显示方式。
 * B站的 extra.reply_uinfo 会携带被回复用户，但正文通常不包含 @用户名；
 * 这种情况由渲染层补出前缀，不能改写原始正文或搜索内容。
 */
export function resolveReplyMention(text: string, target?: ReplyMentionTarget): ReplyMentionResolution | null {
  const uname = target?.uname?.trim();
  if (!uname) return null;
  const label = `@${uname}`;
  const match = findReplyMention(text, target);
  return {
    label,
    match,
    prepend: match === null,
  };
}
