import type { AdapterContext, DanmakuEvent } from './types';

const pendingByContext = new WeakMap<AdapterContext, Map<string, Promise<string | undefined>>>();

/** 购买报文没有头像时，先使用同连接资料，再补取用户头像。 */
export async function completeGuardAvatar(
  event: DanmakuEvent,
  ctx: AdapterContext,
  lookup: (uid: number) => Promise<{ face?: string }>,
): Promise<DanmakuEvent> {
  const user = event.user;
  if (!user || user.avatar) return event;
  const avatars = ctx.avatarsByUid ?? (ctx.avatarsByUid = new Map());
  let avatar = avatars.get(user.uid);
  if (!avatar) {
    let pending = pendingByContext.get(ctx);
    if (!pending) { pending = new Map(); pendingByContext.set(ctx, pending); }
    let request = pending.get(user.uid);
    if (!request) {
      request = lookup(Number(user.uid)).then(info => info.face || undefined).catch(() => undefined);
      pending.set(user.uid, request);
    }
    const fetched = await request;
    pending.delete(user.uid);
    avatar = avatars.get(user.uid) || fetched;
    if (avatar) avatars.set(user.uid, avatar);
  }
  return avatar ? { ...event, user: { ...user, avatar } } : event;
}
