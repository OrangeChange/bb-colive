/** 来源生成器按用户抽取的展示资料；身份仅属于本条消息。 */
export function bindSimulationIdentity(record, session, sequence) {
  if (!record) return null;
  const payload = record.payload;
  const name = String(payload.authorName ?? '');
  return { ...record, payload: { ...payload, id: `preview:${session}:${sequence}`,
    uid: payload.uid || `preview-user:${name}`, authorName: name,
    avatarUrl: !payload.avatarUrl || payload.avatarUrl === '//static.hdslb.com/images/member/noface.gif' ? '/media/noface.gif' : payload.avatarUrl,
    ...(payload.authorNamePronunciation !== undefined ? {authorNamePronunciation:name} : {}),
  } };
}
