import { createNativeDesignSamples } from '../preview/nativeDesignSamples.ts';
import {completePreviewEventMedia} from '../preview/previewUserMedia.ts';
import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import materials from "../preview/nativePreviewSamples.json" with { type: "json" };

import staticMaterials from "../preview/nativeStaticSamples.json" with { type: "json" };

export type PreviewEventKind = "混合流" | "弹幕" | "互动" | "礼物" | "红包/天选" | "醒目留言" | "大航海" | "系统";
export const NATIVE_PREVIEW_GAPS: readonly string[] = materials.gaps;
// 用户资料来自独立保存的素材；管理状态为预览示例，不代表历史记录。
const previewUser = (name: string) => structuredClone(materials.samples.find(sample => sample.event.user?.uname === name)?.event.user) as DanmakuEvent["user"];
const systemFallbacks: DanmakuEvent[] = [
  { msgType: MsgType.RoomBlock, text: "被禁言", user: previewUser("妖刀静刃") },
  { msgType: MsgType.RoomSilent, text: "已开启房间禁言", roomSilent: { action: "on", type: "all" } },
  { msgType: MsgType.RoomSilent, text: "已解除房间禁言", roomSilent: { action: "off" } },
  { msgType: MsgType.AdminChange, adminAction: "appoint", text: "已被设为房管", user: previewUser("冰泠秋没在画") },
  { msgType: MsgType.AdminChange, adminAction: "revoke", text: "的房管身份已被撤销", user: previewUser("妖刀静刃") },
  { msgType: MsgType.AdminChange, adminAction: "list", text: "房管名单已更新，共 6 人" },
  { msgType: MsgType.CutOff, text: "违反直播言论规范，请立即调整" },
].map((event, index) => ({ ...event, id: `native-preview:system-${event.msgType}-${index}`, roomId: 22381346, ts: 1700000000000 } as DanmakuEvent));
const samples = new Map(materials.samples.map(sample => [sample.key, sample]));

function eventsInOrder(kind: PreviewEventKind, order: readonly string[]): DanmakuEvent[] {
  const result = order.flatMap(key => {
    const sample = samples.get(key)!;
    if ([MsgType.Recall,MsgType.CoverAudit].includes(sample.event.msgType)) return [];
    if (kind !== "混合流" && sample.kind !== kind) return [];
    const event = structuredClone(sample.event) as unknown as DanmakuEvent;
    completePreviewEventMedia(event);
    event.id = `native-preview:${sample.key}`;
    return [event];
  });
  if (kind === "混合流" || kind === "互动") for (const [interactKind,text] of [["specialFollow","特别关注了主播"],["mutualFollow","与主播互相关注了"]] as const) {
    if(!result.some(e=>e.interactKind===interactKind)) result.push({id:`native-preview:${interactKind}`,roomId:22381346,ts:1700000000000,msgType:MsgType.Interact,interactKind,text,user:previewUser("公子当如是_")});
  }
  if (kind === "混合流" || kind === "红包/天选") {
    const lottery = result.find(event => event.msgType === MsgType.AnchorLotStart);
    if (lottery?.lottery && !result.some(event => event.lottery?.giftName)) {
      result.push({ ...structuredClone(lottery), id: "native-preview:lottery-required-gift", lottery: { ...structuredClone(lottery.lottery), giftName: "小心心" } });
    }
    for (const type of [MsgType.AnchorLotAward, MsgType.RedPocketWinner]) {
      const award = result.find(event => event.msgType === type && event.lottery?.winners?.length);
      if (award?.lottery?.winners?.length && !result.some(event => event.msgType === type && (event.lottery?.awardNum ?? 0) > (event.lottery?.winners?.length ?? 0))) {
        result.push({ ...structuredClone(award), id: `native-preview:partial-winners-${type}`, lottery: { ...structuredClone(award.lottery), awardNum: award.lottery.winners.length + 2 } });
      }
    }
  }
  // 设计样例补齐身份与特殊周期，不改写采集素材或历史记录。
  if (kind === "混合流" || kind === "大航海") {
    const source=result.find(e=>e.msgType===MsgType.GuardBuy);
    if(source?.user && !result.some(e=>e.guard?.level===3)) result.push({...structuredClone(source),id:"native-preview:guard-viceroy",user:{...source.user,guardLevel:3},guard:{...source.guard!,level:3,price:19998000,priceRmb:19998,action:"升级",count:1,unit:"月"}});
    if(source?.user && !result.some(e=>e.guard?.priceRmb===0)) result.push({...structuredClone(source),id:"native-preview:guard-days",guard:{...source.guard!,priceRmb:0,action:"续费",count:1,unit:"*5天"}});
  }
  if ((kind === "混合流" || kind === "大航海") && !result.some(e=>e.msgType===MsgType.GuardHonor)) result.push({id:"native-preview:guard-honor",roomId:22381346,ts:1700000000000,msgType:MsgType.GuardHonor,broadcaster:previewUser("白水Jimmy"),honor:{firstLine:"恭喜主播<%白水Jimmy%>",secondLine:"舰队规模突破<%1000%>"}});
  return kind === "系统" || kind === "混合流" ? [...result, ...systemFallbacks.filter(f => !result.some(e => e.msgType === f.msgType)).map(e => structuredClone(e))] : result;
}

export function createStylePreviewEvents(kind: PreviewEventKind): DanmakuEvent[] {
  return staticMaterials.samples
    .filter(sample => kind === "混合流" || sample.kind === kind)
    .map(sample => structuredClone(sample.event) as unknown as DanmakuEvent);
}
/** 动态预览沿用独立的捕获集合，不受静态选样影响。 */
export function createStylePreviewSimulationEvents(kind: PreviewEventKind): DanmakuEvent[] {
  return eventsInOrder(kind, materials.orders.static);
}
export function createStylePreviewPartEvents(kind: PreviewEventKind): DanmakuEvent[] {
  return createStylePreviewEvents(kind);
}
export function createStylePreviewDesignEvents(kind: PreviewEventKind, priceMinimums?: readonly number[]): DanmakuEvent[] {
  return createNativeDesignSamples(eventsInOrder("混合流", materials.orders.design), priceMinimums)
    .filter(sample => kind === "混合流" || (kind === "红包/天选" ? sample.category === "天选" || sample.category === "红包" : sample.category === kind))
    .map(sample => sample.event);
}
