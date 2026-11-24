import { MsgType, type DanmakuEvent } from "../protocol/types.ts";

/** 说明式点选文案；头像、表情和礼物媒体仍使用输入素材。 */
export function describeNativeDesignEvent(
  key: string,
  event: DanmakuEvent,
): string[] {
  const fields: string[] = [];
  if (event.user) {
    event.user.uname = event.user.isAnchor
      ? "主播用户"
      : event.user.isAdmin
        ? event.user.guardLevel
          ? `房管＋${["", "舰长", "提督", "总督"][event.user.guardLevel]}用户`
          : "房管用户"
        : `${["普通", "舰长", "提督", "总督"][event.user.guardLevel]}用户`;
    fields.push("user.uname");
    if (event.user.medal) {
      event.user.medal.name = "示例牌";
      fields.push("user.medal.name");
    }
  }
  if (event.broadcaster) {
    event.broadcaster.uname = "示例主播";
    fields.push("broadcaster.uname");
  }
  if (event.msgType === MsgType.Danmu) {
    const shape = key
      .replace(/^body-/, "")
      .replace(/^repeat-/, "")
      .replace(/-\d+$/, "");
    const descriptions: Record<string, string> = {
      short: "这是一条普通短弹幕。",
      long: "这是一条用于检查自动换行的长弹幕。正文连续排成多行，观察头像是否与第一排文字居中、后续文字是否自然换行，以及各行之间的间距是否一致。调整字号和预览宽度后，也可以继续检查整条消息的布局。",
      reply: "这是一条回复弹幕，用于检查回复对象与正文的衔接。",
      "big-emote": "UP主大表情示例",
      "banner-emote": "横条表情示例",
      "room-emote": "房间专属表情示例",
      "charge-emote": "充电专属表情示例",
      "collection-emote": "收藏集表情示例",
      auto: "自动弹幕示例：检查自动发送标记与正文的排列。",
      recalled: "这是一条已撤回的弹幕，用于检查撤回后的文字样式。",
    };
    if (key === "repeat-short-3") {
      event.text = "相同弹幕合并示例：3条弹幕合并为一条。";
    } else if (key.startsWith("identity-")) {
      event.text = `${event.user!.uname}：展示用户名配色、身份标记与用户信息排列。`;
      if (event.user!.guardLevel && !event.user!.isAdmin && !event.user!.isAnchor)
        event.text = `${event.user!.uname}：${key.endsWith("thousand") ? "千舰" : "普通"}图标，比较同一身份的图标样式。`;
      if (event.danmuDeleted)
        event.text = `${event.user!.uname}：展示身份叠加与已撤回状态。`;
    } else if (shape === "inline-emote") {
      event.text = `行内表情 ${Object.keys(event.emotes ?? {}).join(" ")} 与正文混排，观察大小和对齐。`;
    } else if (descriptions[shape]) {
      event.text = descriptions[shape];
      if (event.emoticon) event.user!.uname = descriptions[shape].replace(/示例$/, "");
    }
    else if (key.startsWith("medal-")) {
      event.text =
        key === "medal-none"
          ? "无粉丝牌用户：检查用户信息的自然排列。"
          : key === "medal-unlit"
            ? "未点亮粉丝牌：检查熄灭状态。"
            : `粉丝牌 Lv.${event.user!.medal!.level}：比较当前等级的配色。`;
    } else if (key.startsWith("rank-"))
      event.text = `当前排行第${event.user!.currentRank}名：检查排行标记与用户信息的对齐。`;
    else if (key === "wealth-medal")
      event.text = "荣耀勋章用户：检查勋章与用户名、粉丝牌的排列。";
    else if (key === "long-username") {
      event.user!.uname = "这是一位用于检查换行和截断效果的长昵称用户";
      event.text = "长昵称示例：观察用户信息换行后的间距与对齐。";
    }
    if (event.replyTo) {
      event.replyTo.uname = "被回复用户";
      fields.push("replyTo.uname");
    }
    fields.push("text");
  } else if (event.msgType === MsgType.Interact && key === "interaction-guard-entry") {
    event.user!.uname = "总督进房用户";
  } else if (event.msgType === MsgType.Gift) {
    event.user!.uname = key.startsWith("blind-")
      ? `盲盒${{ loss: "亏损", even: "持平", profit: "盈利" }[key.slice(6) as "loss" | "even" | "profit"]}用户`
      : key === "gift-free"
        ? "免费礼物用户"
        : key.startsWith("gift-band-")
          ? `普通礼物 · ¥${event.gift!.totalRmb}`
          : "多数量礼物用户";
  } else if (event.msgType === MsgType.SuperChat) {
    event.user!.uname = event.scDeleted
      ? "已撤回醒目留言用户"
      : event.sc?.trans
        ? "平台译文用户"
        : `醒目留言 · ¥${event.sc!.price}`;
    event.sc!.message = event.scDeleted
      ? "这是一条已撤回的醒目留言，用于检查删除状态与正文布局。"
      : `¥${event.sc!.price}档醒目留言：检查当前价格档位的配色、金额和正文布局。`;
    if (key === "sc-long")
      event.sc!.message =
        "这是一条用于检查自动换行的长醒目留言。正文会连续排成多行，用来观察金额、头像、用户名与正文之间的关系，以及卡片增高后的内边距。调整基准字号或预览宽度后，也应当保持自然换行与稳定对齐。";
    if (event.sc!.trans)
      event.sc!.trans =
        "这是一条平台译文示例，用于检查译文与正文的层级和间距。";
    fields.push("sc.message", "sc.trans");
  } else if (event.msgType === MsgType.GuardBuy) {
    event.user!.uname = `${["", "舰长", "提督", "总督"][event.guard!.level]}${event.guard!.action ?? ""}用户`;
    if (key.endsWith("-开通") || key.endsWith("-thousand"))
      event.user!.uname = `${["", "舰长", "提督", "总督"][event.guard!.level]}${key.endsWith("thousand") ? "千舰" : "普通"}图标用户`;
  } else if (event.msgType === MsgType.GuardHonor) {
    event.honor!.firstLine = "恭喜主播<%示例主播%>";
    fields.push("honor.firstLine");
  } else if (
    event.msgType === MsgType.AnchorLotStart ||
    event.msgType === MsgType.AnchorLotAward
  ) {
    event.lottery!.awardName = "天选奖品示例";
    if (event.lottery!.danmu) event.lottery!.danmu = "天选口令示例";
    fields.push("lottery.awardName", "lottery.danmu");
  } else if (event.msgType === MsgType.RedPocketStart) {
    event.user!.uname = `${event.pocket?.rpType === 2 ? "大航海" : event.pocket?.rpType === 3 ? "电池" : "普通"}红包发起用户`;
    if (event.pocket?.danmu) {
      event.pocket.danmu = "老板大气，祝大家好运！";
      fields.push("pocket.danmu");
    }
  }
  if (event.lottery?.winners) {
    event.lottery.winners = event.lottery.winners.map((winner, index) => ({
      ...winner,
      uname: `中奖用户${index + 1}`,
    }));
    if (
      event.user &&
      [MsgType.AnchorLotAward, MsgType.RedPocketWinner].includes(event.msgType)
    )
      event.user.uname = "中奖用户1";
    fields.push("lottery.winners");
  }
  return fields;
}
