import { MsgType, type DanmakuEvent, type GuardLevel } from '../protocol/types.ts';
import { GUARD_HONOR_TIERS } from '../protocol/guardHonor.ts';
import captured from './nativeDesignCaptured.json' with { type: 'json' };
import materials from './nativePreviewSamples.json' with { type: 'json' };
import staticMaterials from './nativeStaticSamples.json' with { type: 'json' };
import emoteMaterials from './nativeDesignEmotes.json' with { type: 'json' };
import { completePreviewEventMedia } from './previewUserMedia.ts';
import { describeNativeDesignEvent } from './nativeDesignCopy.ts';

export type NativeDesignCategory = '弹幕' | '互动' | '礼物' | '醒目留言' | '大航海' | '天选' | '红包' | '系统';
export interface NativeDesignSample {
  key: string;
  category: NativeDesignCategory;
  sourceId: string;
  origin: 'captured' | 'variant' | 'supplemental';
  changedFields: string[];
  event: DanmakuEvent;
}
const DEFAULT_PRICE_MINIMUMS = [0, 30, 50, 100, 500, 1000, 2000];

/** 设计变体与实录分开保存，来源编号始终指向未经改写的输入样例。 */
export function createNativeDesignSamples(input: readonly DanmakuEvent[], priceMinimums: readonly number[] = DEFAULT_PRICE_MINIMUMS): NativeDesignSample[] {
  const pool = [...input, ...captured.samples.map(sample => {
    const event = structuredClone(sample.event) as unknown as DanmakuEvent;
    event.id = `native-capture:${sample.key}`;
    completePreviewEventMedia(event);
    return event;
  })];
  const sources = new Map<string, string>([
    ...materials.samples.map(sample => [`native-preview:${sample.key}`, sample.source.eventKey ?? sample.key] as const),
    ...captured.samples.map(sample => [`native-capture:${sample.key}`, sample.source.eventKey ?? sample.key] as const),
  ]);
  const result: NativeDesignSample[] = [];
  const staticEvent = (key: string) => staticMaterials.samples.find(sample => sample.key === key)!.event as unknown as DanmakuEvent;
  const emoteEvent = (key: string) => emoteMaterials.samples.find(sample => sample.key === key)!.event as unknown as DanmakuEvent;
  for (const sample of emoteMaterials.samples) sources.set(sample.event.id, sample.source.eventKey);
  const first = (type: MsgType, matches: (event: DanmakuEvent) => boolean = () => true) => {
    const source = pool.find(event => event.msgType === type && matches(event));
    if (!source) throw new Error(`点选样例缺少来源：${type}`);
    return source;
  };
  const add = (key: string, category: NativeDesignCategory, source: DanmakuEvent, changedFields: string[] = [], change?: (event: DanmakuEvent) => void) => {
    const event = structuredClone(source);
    if (event.msgType === MsgType.Danmu) {
      if (key !== 'body-reply') event.replyTo = undefined;
      if (key !== 'body-inline-emote') event.emotes = undefined;
      if (!key.endsWith('-emote') || key === 'body-inline-emote') event.emoticon = undefined;
      event.isAutoDanmaku = key === 'body-auto';
      event.danmakuSendType = key === 'body-auto' ? source.danmakuSendType : undefined;
      event.danmuRepeatCount = undefined;
      event.danmuDeleted = key === 'body-recalled';
      const user = event.user!;
      if (!key.startsWith('identity-')) {
        user.guardLevel = 0; user.isAdmin = undefined; user.isAnchor = undefined;
        user.guardIconUrl = undefined; user.guardMilestone = undefined; user.guardIconSet = undefined;
      }
      if (!key.startsWith('medal-')) user.medal = undefined;
      if (!key.startsWith('rank-')) user.currentRank = undefined;
      if (key !== 'wealth-medal') { user.wealthLevel = undefined; user.wealthIconKey = undefined; user.wealthIconUrl = undefined; }
      changedFields = [...changedFields, 'user', 'replyTo', 'emotes', 'emoticon', 'danmuRepeatCount', 'danmuDeleted', 'isAutoDanmaku', 'danmakuSendType'];
    }
    change?.(event);
    changedFields = [...new Set([...changedFields, ...describeNativeDesignEvent(key, event)])];
    event.id = `native-design:${key}`;
    event.ts = 1700000000000 + result.length;
    event.activity = undefined;
    result.push({ key, category, sourceId: sources.get(source.id) ?? source.id,
      origin: changedFields.length ? 'variant' : sources.has(source.id) ? 'captured' : 'supplemental', changedFields, event });
  };
  const plain = (event: DanmakuEvent) => !event.emoticon && !event.emotes && !event.replyTo && !event.danmuDeleted;
  const chat = first(MsgType.Danmu, event => plain(event) && event.user?.guardLevel === 0);
  const identities = [
    ['normal', 0, false, false], ['captain', 1, false, false], ['admiral', 2, false, false],
    ['governor', 3, false, false], ['admin', 0, true, false], ['anchor', 0, false, true],
  ] as const;
  for (const [name, level, admin, anchor] of identities) {
    const source = pool.find(event => event.msgType === MsgType.Danmu && plain(event) && event.user?.guardLevel === level
      && Boolean(event.user.isAdmin) === admin && Boolean(event.user.isAnchor) === anchor)
      ?? pool.find(event => event.msgType === MsgType.Danmu && event.user && (admin ? event.user.isAdmin : anchor ? event.user.isAnchor : event.user.guardLevel === level)) ?? chat;
    add(`identity-${name}`, '弹幕', source, ['user.guardLevel', 'user.isAdmin', 'user.isAnchor', 'replyTo', 'emotes', 'emoticon'], event => {
      event.user = { ...event.user!, guardLevel: level, isAdmin: admin, isAnchor: anchor };
      if (level) { event.user.guardMilestone = 'standard'; event.user.guardIconSet = 'base'; event.user.guardIconUrl = undefined; }
      event.replyTo = undefined; event.emotes = undefined; event.emoticon = undefined;
    });
  }
  for (const [name, level] of [['captain', 1], ['admiral', 2], ['governor', 3]] as const)
    add(`identity-${name}-thousand`, '弹幕', chat, ['user.guardLevel', 'user.guardMilestone', 'user.guardIconSet', 'user.guardIconUrl'], event => {
      event.user = { ...event.user!, guardLevel: level, guardMilestone: 'thousand', guardIconSet: 'enhanced', guardIconUrl: undefined };
    });
  for (const [key, predicate, deleted] of [
    ['admin-guard', (event: DanmakuEvent) => Boolean(event.user?.isAdmin && event.user.guardLevel > 0), false],
    ['anchor-guard', (event: DanmakuEvent) => Boolean(event.user?.isAnchor && event.user.guardLevel > 0), true],
  ] as const) add(`identity-${key}`, '弹幕', first(MsgType.Danmu, predicate), deleted ? ['danmuDeleted'] : [], event => { if (deleted) event.danmuDeleted = true; });

  const bodies: [string, (event: DanmakuEvent) => boolean][] = [
    ['short', event => plain(event) && (event.text?.length ?? 0) < 30],
    ['long', event => plain(event) && (event.text?.length ?? 0) > 60],
    ['reply', event => Boolean(event.replyTo)], ['inline-emote', event => Boolean(event.emotes)],
    ['big-emote', event => Boolean(event.emoticon && !event.emoticon.unique?.startsWith('official_'))],
    ['banner-emote', event => Boolean(event.emoticon?.unique?.startsWith('official_'))],
  ];
  for (const [key, predicate] of bodies) add(`body-${key}`, '弹幕', key === 'big-emote' ? emoteEvent('up') : first(MsgType.Danmu, predicate));
  for (const key of ['room', 'charge']) add(`body-${key}-emote`, '弹幕', emoteEvent(key));
  add('body-collection-emote', '弹幕', staticEvent('slot-13'));
  add('body-auto', '弹幕', staticEvent('chat-auto'));
  const recalled = pool.find(event => event.msgType === MsgType.Danmu && event.danmuDeleted);
  if (recalled) add('body-recalled', '弹幕', recalled);
  add('repeat-short-3', '弹幕', chat, ['danmuRepeatCount'], event => { event.danmuRepeatCount = 3; });
  const medalSource = first(MsgType.Danmu, event => Boolean(event.user?.medal));
  for (const level of [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115]) {
    add(`medal-${level}`, '弹幕', medalSource, ['user.medal.level', 'user.medal.isLighted'], event => {
      event.user!.medal = { ...event.user!.medal!, level, isLighted: true };
    });
  }
  add('medal-unlit', '弹幕', medalSource, ['user.medal.isLighted'], event => { event.user!.medal!.isLighted = false; });
  add('medal-none', '弹幕', chat, ['user.medal'], event => { event.user!.medal = undefined; });
  for (const rank of [1, 2, 3]) add(`rank-${rank}`, '弹幕', chat, ['user.currentRank'], event => { event.user!.currentRank = rank; });
  const wealth = pool.find(event => event.msgType === MsgType.Danmu && (event.user?.wealthLevel ?? 0) > 0);
  if (wealth) add('wealth-medal', '弹幕', wealth);
  const longName = pool.find(event => event.msgType === MsgType.Danmu && (event.user?.uname.length ?? 0) > 14);
  if (longName) add('long-username', '弹幕', longName);

  for (const kind of ['entry', 'follow', 'share', 'specialFollow', 'mutualFollow', 'like'] as const) {
    add(`interaction-${kind}`, '互动', first(MsgType.Interact, event => event.interactKind === kind));
  }
  add('interaction-guard-entry', '互动', staticEvent('guard-entry'));
  const paidGift = first(MsgType.Gift, event => Boolean(event.gift && !event.gift.blindGiftName && !event.gift.isFree && event.gift.coinType !== 'silver'));
  const values = [...new Set(priceMinimums)].sort((a, b) => a - b).map((min, index, minima) => min === 0 ? Math.min(2, (minima[index + 1] ?? 4) / 2) : min);
  add('gift-free', '礼物', first(MsgType.Gift, event => Boolean(event.gift?.isFree || event.gift?.coinType === 'silver')));
  const priceGift = (event: DanmakuEvent, value: number, count = 1) => {
    event.gift = { ...event.gift!, count, price: value * 1000, total: value * count * 1000, priceRmb: value, totalRmb: value * count, paymentRmb: value * count };
  };
  for (const [index, value] of values.entries()) add(`gift-band-${index}`, '礼物', paidGift,
    ['gift.count', 'gift.price', 'gift.total', 'gift.priceRmb', 'gift.totalRmb', 'gift.paymentRmb'], event => priceGift(event, value));
  for (const count of [12, 128]) add(`gift-quantity-${count}`, '礼物', paidGift, ['gift.count', 'gift.total', 'gift.totalRmb', 'gift.paymentRmb'], event => priceGift(event, paidGift.gift!.priceRmb ?? paidGift.gift!.price / 1000, count));
  const blind = first(MsgType.Gift, event => Boolean(event.gift?.blindGiftName));
  for (const [name, multiplier] of [['loss', 0.5], ['even', 1], ['profit', 2]] as const) {
    const existing = pool.find(event => event.msgType === MsgType.Gift && event.gift?.blindGiftName && Math.sign((event.gift.blindHitPriceRmb ?? event.gift.priceRmb ?? 0) - (event.gift.blindPriceRmb ?? 0)) === Math.sign(multiplier - 1));
    add(`blind-${name}`, '礼物', existing ?? blind, existing ? [] : ['gift.blindHitPriceRmb', 'gift.priceRmb', 'gift.totalRmb', 'gift.paymentRmb'], event => {
      if (existing) return;
      const cost = event.gift!.blindPriceRmb!;
      const value = cost * multiplier;
      priceGift(event, value);
      event.gift!.blindHitPriceRmb = value;
      event.gift!.paymentRmb = cost;
    });
  }

  const sc = first(MsgType.SuperChat);
  for (const [index, value] of values.entries()) {
    const existing = pool.find(event => event.msgType === MsgType.SuperChat && event.sc?.price === value && !event.scDeleted);
    add(`sc-band-${index}`, '醒目留言', existing ?? sc, existing ? [] : ['sc.price'], event => { event.sc!.price = value; });
  }
  add('sc-long', '醒目留言', sc, ['sc.message']);
  add('sc-recalled', '醒目留言', first(MsgType.SuperChat, event => Boolean(event.scDeleted)));
  const translated = pool.find(event => event.msgType === MsgType.SuperChat && event.sc?.trans);
  if (translated) add('sc-translation', '醒目留言', translated);

  for (const level of [1, 2, 3] as GuardLevel[]) {
    const source = first(MsgType.GuardBuy, event => event.guard?.level === level);
    for (const action of (level === 1 ? ['开通', '续费', '升级'] : ['开通']) as ('开通' | '续费' | '升级')[]) add(`guard-${level}-${action}`, '大航海', source, ['guard.action', 'guard.opType'], event => {
      event.guard!.action = action; event.guard!.opType = action === '升级' ? 3 : action === '续费' ? 2 : 1;
      event.user!.guardMilestone = 'standard'; event.user!.guardIconSet = 'base'; event.user!.guardIconUrl = undefined;
    });
  }
  for (const level of [1, 2, 3] as const)
    add(`guard-${level}-thousand`, '大航海', first(MsgType.GuardBuy, event => event.guard?.level === level), ['user.guardMilestone', 'user.guardIconSet', 'user.guardIconUrl', 'guard.action', 'guard.opType'], event => {
      event.user!.guardMilestone = 'thousand'; event.user!.guardIconSet = 'enhanced'; event.user!.guardIconUrl = undefined;
      event.guard!.action = '开通'; event.guard!.opType = 1;
    });
  const guard = first(MsgType.GuardBuy);
  add('guard-multiple-months', '大航海', guard, ['guard.count', 'guard.price', 'guard.priceRmb'], event => {
    const count = event.guard!.count || 1;
    if (event.guard!.priceRmb !== undefined) event.guard!.priceRmb = event.guard!.priceRmb! / count * 12;
    if (event.guard!.price !== undefined) event.guard!.price = event.guard!.price! / count * 12;
    event.guard!.count = 12;
  });
  add('guard-special-duration', '大航海', first(MsgType.GuardBuy, event => event.guard?.unit?.startsWith('*') === true));
  const honor = first(MsgType.GuardHonor);
  for (const tier of GUARD_HONOR_TIERS) add(`honor-${tier.count}`, '大航海', honor, ['honor.threshold', 'honor.effectId', 'honor.secondLine'], event => {
    event.honor = { ...event.honor!, threshold: tier.count, effectId: tier.effectId, secondLine: `舰队规模突破<%${tier.count}%>` };
  });

  const lottery = first(MsgType.AnchorLotStart);
  add('lottery-complete', '天选', lottery, ['lottery'], event => {
    event.lottery = { ...event.lottery!, id: 910000, danmu: '天选口令示例',
      giftName: pool.find(row => row.lottery?.giftName)?.lottery?.giftName ?? '小心心',
      requireText: pool.find(row => row.lottery?.requireText)?.lottery?.requireText ?? '关注主播' };
  });
  add('lottery-result', '天选', first(MsgType.AnchorLotAward));
  for (const type of [1, 2, 3]) add(`redpocket-${type}`, '红包', first(MsgType.RedPocketStart, event => type === 1 ? !event.pocket?.rpType || event.pocket.rpType === 1 : event.pocket?.rpType === type), ['lottery.id', 'pocket.lotId'], event => {
    const id = 920000 + result.length; event.lottery!.id = id; event.pocket!.lotId = id;
  });
  add('redpocket-result', '红包', first(MsgType.RedPocketWinner, event => (event.lottery?.winners?.length ?? 0) > 1));

  for (const type of [MsgType.LiveStart, MsgType.LiveEnd, MsgType.RoomBlock]) add(`system-${type}`, '系统', first(type));
  const silent = first(MsgType.RoomSilent);
  for (const action of ['on', 'off'] as const) add(`room-silent-${action}`, '系统', silent, ['roomSilent.action'], event => { event.roomSilent = { ...event.roomSilent!, action }; });
  for (const action of ['appoint', 'revoke', 'list'] as const) add(`admin-${action}`, '系统', first(MsgType.AdminChange, event => event.adminAction === action));
  add('room-change', '系统', first(MsgType.RoomChange));
  add('room-lock', '系统', pool.find(event => event.msgType === MsgType.RoomLock) ?? { id: 'native-supplement:room-lock', msgType: MsgType.RoomLock, roomId: 870004, ts: 1700000000000, text: '直播间被封禁', roomLock: { endsAt: 1795719600000, source: 'expire' } });
  for (const [key, type] of [['warning-captured', MsgType.Warning], ['cutoff', MsgType.CutOff]] as const) {
    const source = staticMaterials.samples.find(sample => sample.event.msgType === type)!;
    add(key, '系统', source.event as unknown as DanmakuEvent);
  }
  return result;
}
