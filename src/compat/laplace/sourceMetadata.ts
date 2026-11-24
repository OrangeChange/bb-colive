import { redPocketWinnerAvatar } from "../../protocol/redPocketWinnerAvatar.ts";
import { captureLaplaceActivity } from './activity.ts';
import protobuf from 'protobufjs';
import type { AdapterContext } from '../../protocol/types.ts';
import type { LaplaceSourceMetadata, LaplaceTimestampUnit } from './types.ts';
import { laplaceDurationSeconds } from './projection.ts';

/** All retained keys below are display/identity facts. In particular SC token,
 * auth packets, full raw transports, and independent gift-effect payloads never
 * cross this boundary. This capture is independent of BB keepRaw. */
const pick = (value: any, keys: readonly string[]): Record<string, any> => {
  const output: Record<string, any> = {};
  for (const key of keys) if (value != null && Object.prototype.hasOwnProperty.call(value, key)
    && (value[key] == null || ['string', 'number', 'boolean'].includes(typeof value[key]))) output[key] = value[key];
  return output;
};
const str = (v: unknown): string => v == null ? '' : String(v);
const number = (v: unknown): number => Number(v) || 0;
const normalizedUrl = (v: unknown): string => typeof v === 'string' ? v.replace('http:', 'https:') : '';
const perk = (icon: unknown): number | undefined => ['fd26e0053f3d24672ffdabcb1f6d2545e26b1e33.png',
  '7cb7dfb5a2e652eb939585ddfd269238868cc5de.png', 'ffcd832b5d7b84ea851cb8156ec0a71940439511.png']
  .some(suffix => str(icon).endsWith(suffix)) ? 2 : undefined;
const basicMedal = (m: any = {}, format: 'user' | 'fans' = 'fans', includeType = true) => format === 'user' ? {
  level: number(m.level), name: m.name || '', room: 0, uid: m.ruid, guardType: number(m.guard_level),
  lightened: m.is_light || 0, ...(includeType ? {type: m.typ || 0} : {}), resolvedPerkLevel: perk(m.guard_icon),
} : { level: number(m.medal_level), name: m.medal_name || '', room: number(m.anchor_roomid),
  uid: m.target_id || 0, guardType: number(m.guard_level), lightened: m.is_lighted || 0, resolvedPerkLevel: perk(m.guard_icon) };
const awards = (items: any): any[] => (Array.isArray(items) ? items : items && typeof items === 'object' ? Object.values(items) : []).map(a => pick(a,
  ['gift_id', 'gift_name', 'gift_pic', 'num', 'award_name', 'award_num', 'gift_num', 'gift_icon', 'gift_price', 'price']));
const BLIND_KEYS = ['blind_gift_config_id', 'from', 'gift_action', 'gift_tip_price', 'original_gift_id', 'original_gift_name', 'original_gift_price'];

// Independent decoder descriptors are transcribed from pinned Stable238 encode
// fields, not BB native's incomplete/provisional V2 mapping. The numeric wire
// tags are evidenced in gift-effect-player-B9XQm1oJ.js (sha256 eb9bbcd0...).
const scalar = (id: number, type = 'uint64') => ({ id, type });
const descriptor = { nested: {
  Gift: { fields: { uid:scalar(1),uname:scalar(2,'string'),face:scalar(3,'string'),guard_level:scalar(5),
    send_master:scalar(7,'Master'),medal_info:scalar(8,'GiftMedal'),blind_gift:scalar(9,'Blind'),
    gift_item:{id:10,type:'GiftItem',rule:'repeated'},wealth:scalar(13,'Wealth'),sender_uinfo:scalar(15,'User') } },
  Master: { fields: { uid:scalar(1),uname:scalar(2,'string') } },
  GiftMedal: { fields: { ruid:scalar(1),level:scalar(5,'uint32'),name:scalar(6,'string'),
    is_lighted:scalar(11,'uint32'),guard_level:scalar(12,'uint32') } },
  Blind: { fields: { blind_gift_config_id:scalar(1),original_gift_id:scalar(2),original_gift_name:scalar(3,'string'),
    from:scalar(4),gift_action:scalar(5,'string'),original_gift_price:scalar(6),gift_tip_price:scalar(7) } },
  GiftItem: { fields: { gift_id:scalar(1,'uint32'),gift_name:scalar(2,'string'),num:scalar(3,'uint32'),
    price:scalar(5),total_coin:scalar(7),coin_type:scalar(8,'string'),timestamp:scalar(10),batch_combo_id:scalar(12,'string'),
    combo_total_coin:scalar(14),action:scalar(18,'string'),receive_user_info:scalar(29,'Receiver'),
    gift_info:scalar(35,'GiftIcon'),gift_tip_price:scalar(36,'int64') } },
  Receiver: { fields: { uname:scalar(1,'string'),uid:scalar(2) } },
  GiftIcon: { fields: { img_basic:scalar(1,'string'),webp:scalar(2,'string'),gif:scalar(5,'string') } },
  Wealth: { fields: { level:scalar(1) } },
  User: { fields: { uid:scalar(1),base:scalar(2,'Base'),medal:scalar(3,'Medal'),wealth:scalar(4,'Wealth') } },
  Base: { fields: { name:scalar(1,'string'),face:scalar(2,'string'),name_color:scalar(3,'int32') } },
  Medal: { fields: { name:scalar(1,'string'),level:scalar(2),typ:scalar(8,'int32'),is_light:scalar(9),
    ruid:scalar(10),guard_level:scalar(11),guard_icon:scalar(13,'string') } },
  Interaction: { fields: { uid:scalar(1),username:scalar(2,'string'),msg_type:scalar(5,'uint32'),room_id:scalar(6,'uint32'),
    timestamp:scalar(7,'uint32'),medal:scalar(9,'InteractionMedal'),trigger_time:scalar(15),guard_type:scalar(16,'uint32'),
    uinfo:scalar(22,'InteractionUser'),relation_tail:scalar(23,'Relation') } },
  InteractionMedal: { fields: { ruid:scalar(1),level:scalar(2,'uint32'),name:scalar(3,'string'),
    is_lighted:scalar(8,'uint32'),guard_level:scalar(9,'uint32'),room_id:scalar(12,'uint32') } },
  InteractionUser: { fields: { uid:scalar(1),base:scalar(2,'InteractionBase'),wealth:scalar(4,'Wealth') } },
  InteractionBase: { fields: { username:scalar(1,'string'),avatar:scalar(2,'string') } },
  Relation: { fields: { tail_icon:scalar(1,'string'),tail_guide_text:scalar(2,'string'),tail_type:scalar(3,'uint32') } },
} };
const sourceRoot = protobuf.Root.fromJSON(descriptor);
function decode(name: string, pb: string): any {
  const type = sourceRoot.lookupType(name);
  return type.toObject(type.decode(Uint8Array.from(atob(pb), c => c.charCodeAt(0))), { longs: String });
}

export function captureLaplaceSourceMetadata(msg: any, ctx: AdapterContext, receivedAt = Date.now()): LaplaceSourceMetadata | LaplaceSourceMetadata[] | undefined {
  const command = str(msg?.cmd ?? msg?.msg?.cmd).split(':')[0];
  const isOpen = command.startsWith('LIVE_OPEN_PLATFORM_');
  const data = msg?.data ?? {};
  let unit: LaplaceTimestampUnit = 'receipt-milliseconds';
  let fallback = false;
  const time = (v: unknown, inputUnit: LaplaceTimestampUnit): { timestamp: number; timestampNormalized: number } => {
    const n = Number(v);
    if (v === undefined || v === null || !Number.isFinite(n) || n <= 0) {
      unit = 'receipt-milliseconds'; fallback = true;
      return { timestamp: receivedAt, timestampNormalized: receivedAt };
    }
    unit = inputUnit;
    return { timestamp: n, timestampNormalized: inputUnit === 'seconds' ? n * 1000 : inputUnit === 'nanoseconds' ? Math.round(n / 1e6) : n };
  };
  const common = (type: string, fields: Record<string, any> = {}) => {
    const e = { type, origin: ctx.roomId, originIdx: ctx.laplaceOriginIdx ?? 0,
      uid: 0 as string | number, username: '', timestamp: receivedAt, timestampNormalized: receivedAt, read: false, ...fields };
    const tail = (v: unknown) => str(v).slice(str(v).lastIndexOf(':') + 1);
    let id = `${e.timestamp}:${ctx.roomId}:${e.uid}`;
    if (type === 'message') id = isOpen ? `${data.msg_id}:${ctx.roomId}:${e.uid}` : `${e.timestamp}:${ctx.roomId}:${e.uid || e.username}`;
    if (type === 'gift') id = `${e.timestamp}:${ctx.roomId}:${tail(data.batch_combo_id)}:${fields.giftId}:${number(data.combo_total_coin) / 1000}`;
    if (type === 'superchat') id = `${e.timestamp}:${ctx.roomId}:${fields.scId}`;
    if (type === 'toast') id = `${e.timestamp}:${ctx.roomId}:${e.username}:${fields.price}`;
    if (type === 'lottery-start' || type === 'lottery-result') id = `0:${ctx.roomId}:${data.id}:${type}`;
    if (type === 'red-envelope-start' || type === 'red-envelope-result') id = `${type === 'red-envelope-result' ? 0 : e.timestamp}:${ctx.roomId}:${data.lot_id}:${type}`;
    if (type === 'effect-message') id = `${e.timestamp}:${ctx.roomId}:${msg.msg_id}`;
    if (type === 'user-block') id = `${data.block_expired}:${ctx.roomId}:${e.uid}`;
    if (['live-start','live-end','room-name-update','room-mute-on','room-mute-off'].includes(type)) id = `${e.timestamp}:${ctx.roomId}:${type}`;
    return { ...e, id, ...(fields.id ? {id:fields.id} : {}) };
  };
  const metadata = (event: Record<string, any>, missing: string[] = []): LaplaceSourceMetadata => {
    const activity = captureLaplaceActivity(str(msg?.cmd ?? msg?.msg?.cmd), event.type, data);
    return {
      sourceCommand: command, platform: 'bilibili', sourceMode: isOpen ? 'open' : 'direct',
      timestampUnit: unit, timestampFallback: fallback,
      event: event as NonNullable<LaplaceSourceMetadata['event']>,
      ...(activity ? { activity } : {}),
      ...(missing.length ? { unavailableFields: missing } : {}),
    };
  };
  try {
    if (isOpen) {
      const user = command === 'LIVE_OPEN_PLATFORM_GUARD' ? data.user_info ?? {} : data;
      const rawOpenID = str(user.open_id);
      const trueUid = user.uid != null && /^\d+$/.test(str(user.uid)) && str(user.uid) !== '0' ? str(user.uid) : undefined;
      const uid = trueUid ?? (rawOpenID ? `open:bilibili:${ctx.roomId}:${encodeURIComponent(rawOpenID)}` : 0);
      const identity = { uid, username:user.uname ?? '', avatar:normalizedUrl(user.uface),
        guardType:number(data.guard_level), medal:{level:data.fans_medal_level,name:data.fans_medal_name,
          room:0,guardType:number(data.guard_level),lightened:+!!data.fans_medal_wearing_status} };
      const rawStamp = time(data.timestamp, 'seconds');
      const stamp = ['LIVE_OPEN_PLATFORM_DM','LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER','LIVE_OPEN_PLATFORM_LIKE',
        'LIVE_OPEN_PLATFORM_LIVE_START','LIVE_OPEN_PLATFORM_LIVE_END'].includes(command)
        ? {...rawStamp,timestamp:rawStamp.timestampNormalized}:rawStamp;
      let event: Record<string, any> | undefined;
      switch (command) {
        case 'LIVE_OPEN_PLATFORM_DM': event = common('message', { ...identity, ...stamp, message:data.msg,
          userType:trueUid === ctx.anchorUid ? 100 : +!!data.is_admin,userLvl:0,userLvlBorder:0,currentRank:0,
          phoneVerified:1,sendType:0,nameColor:'',wealthMedalLevel:data.glory_level || 0,
          emote:data.emoji_img_url === '' ? undefined : {bulge_display:0,emoticon_unique:'',url:normalizedUrl(data.emoji_img_url)},
          reply:data.reply_open_id ? {uid:`open:bilibili:${ctx.roomId}:${encodeURIComponent(data.reply_open_id)}`,uname:data.reply_uname} : {},
          idStr:'',sign:'' }); break;
        case 'LIVE_OPEN_PLATFORM_SEND_GIFT': { const price = data.r_price * data.gift_num || data.price * data.gift_num;
          event = common('gift',{...identity,...stamp,message:data.gift_name,price,priceNormalized:price/1000,
            duration:laplaceDurationSeconds(price/1000),coinType:data.paid?'gold':'silver',giftType:0,giftAction:'投喂',
            id:`${stamp.timestamp}:${ctx.roomId}:${str(data.combo_info?.combo_id).split(':').pop()}:${data.gift_id}:${number(data.combo_info?.combo_count)*number(data.combo_info?.combo_base_num)*number(data.price)/1000}`,
            giftAmount:data.gift_num,giftId:data.gift_id,giftName:data.gift_name,giftRemain:0,giftIcon:data.gift_icon||'',
            bizSource:'Live',receiver:{...pick(data.anchor_info,['uid','uname']),master:null},blindGift:null,wealthMedalLevel:0}); break; }
        case 'LIVE_OPEN_PLATFORM_SUPER_CHAT': event = common('superchat',{...identity,...stamp,message:data.message,
          price:data.rmb,priceNormalized:data.rmb,duration:data.end_time-data.start_time,messageColor:'',messageTrans:'',
          transMark:0,isAudited:0,rate:0,avatarFrame:'',guardBackground:'',scId:data.message_id,scName:'醒目留言',scAmount:1,deleted:false}); break;
        case 'LIVE_OPEN_PLATFORM_SUPER_CHAT_DEL': return {sourceCommand:command,sourceMode:'open',platform:'bilibili',
          timestampUnit:unit,timestampFallback:fallback,deleteIds:(data.message_ids ?? []).map(str)};
        case 'LIVE_OPEN_PLATFORM_GUARD': { const guard = number(data.guard_level);
          // Pinned original explicitly defines these fallback prices and names.
          const prices: Record<number,number> = {0:0,1:19998000,2:1998000,3:138000};
          const names: Record<number,string> = {0:'',1:'总督',2:'提督',3:'舰长'};
          const price = data.price ?? prices[guard] ?? 0;
          event = common('toast',{uid:identity.uid,username:identity.username,avatar:identity.avatar,...stamp,message:names[guard]??'未知大航海',price:price*data.guard_num,
            priceNormalized:price/1000*data.guard_num,duration:laplaceDurationSeconds(price/1000),mockPrice:false,
            color:'',toastType:guard,toastAmount:data.guard_num,toastAmountUnit:data.guard_unit,toastName:names[guard]??'未知大航海',toastTotalCount:0,toastId:0}); break; }
        case 'LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER': event = common('interaction',{...identity,...stamp,action:1,guardType:0,
          medal:{level:0,name:'',room:0,guardType:0,lightened:1},wealthMedalLevel:0,relation:{type:0,icon:'',text:''}}); break;
        case 'LIVE_OPEN_PLATFORM_LIKE': event = common('like-click',{...identity,...stamp,message:data.like_text,
          medal:{...identity.medal,guardType:0}}); break;
        case 'LIVE_OPEN_PLATFORM_LIVE_START': event = common('live-start',{...stamp,origin:data.room_id||ctx.roomId,message:'开播了',initial:true}); break;
        case 'LIVE_OPEN_PLATFORM_LIVE_END': event = common('live-end',{...stamp,origin:data.room_id||ctx.roomId,message:'下播了'}); break;
      }
      if (!event) return undefined;
      return {...metadata(event),...(rawOpenID ? {rawOpenID} : {}),...(trueUid?{trueUid}:{}),
        // Open DM's phoneVerified=1/sendType=0 preserve upstream admission.
        // They must never be promoted into observed canonical user facts.
        ...(command==='LIVE_OPEN_PLATFORM_DM'?{sourcePhoneVerification:'unknown' as const,
          phoneVerifiedProvenance:'upstream-normalizer-constant' as const}:{}),
        ...(data.reply_open_id ? {rawReplyOpenID:str(data.reply_open_id)} : {})};
    }
    switch (command) {
      case 'DANMU_MSG':
      case 'DANMU_MSG_MIRROR': {
        const info = msg.info;
        if (!Array.isArray(info)) return undefined;
        const head = info[0] || [], u = head[15]?.user, rawExtra = head[15]?.extra;
        let extra: any = {};
        try { extra = typeof rawExtra === 'string' ? JSON.parse(rawExtra) : rawExtra ?? {}; } catch { /* diagnostic below */ }
        const emotes: Record<string,any> = {};
        for (const [key,val] of Object.entries(extra.emots ?? {})) if (val && typeof val === 'object')
          emotes[key] = {...pick(val,['width','height']),url:normalizedUrl((val as any).url)};
        const emote = head[13] && typeof head[13] === 'object' && 'url' in head[13]
          ? {...pick(head[13],['bulge_display','emoticon_unique','width','height','in_player_area','is_dynamic','height','width']),url:normalizedUrl(head[13].url)} : undefined;
        return metadata(common('message',{...time(head[4],'milliseconds'),uid:info[2]?.[0]??0,username:info[2]?.[1]??'',
          avatar:normalizedUrl(u?.base?.face),nameColor:info[2]?.[7],message:info[1],
          userType:str(info[2]?.[0])===ctx.anchorUid?100:info[2]?.[2],userLvl:info[4]?.[0],userLvlBorder:info[4]?.[2],
          currentRank:info[4]?.[4],phoneVerified:info[2]?.[6],guardType:info[7],guardLeader:u?.guard_leader?.is_guard_leader||false,
          sendType:head[9],medal:{...basicMedal(u?.medal,'user'),room:info[3]?.[3]||0},emote,
          bmotes:Object.keys(emotes).length?emotes:undefined,reply:extra.show_reply?{uid:extra.reply_mid,uname:extra.reply_uname}:{},
          idStr:extra.id_str??'',sign:info[9]?.ct,wealthMedalLevel:info[16]?.[0]||0,
          isMirror:command==='DANMU_MSG_MIRROR'||extra.is_mirror}),
          [info[2]?.[6]===undefined?'phoneVerified':'',u?.medal===undefined?'user.medal':''].filter(Boolean));
      }
      case 'SEND_GIFT': {
        const sender=data.sender_uinfo, medal=data.medal_info;
        return metadata(common('gift',{...time(data.timestamp,'seconds'),uid:sender?.uid||data.uid,username:sender?.base?.name||data.uname,
          avatar:normalizedUrl(sender?.base?.face||data.face),message:data.giftName,price:data.total_coin,priceNormalized:data.total_coin/1000,
          duration:laplaceDurationSeconds(data.total_coin/1000),coinType:data.coin_type,guardType:data.guard_level,
          giftType:data.giftType,giftAction:data.action,giftAmount:data.num,giftId:data.giftId,giftName:data.giftName,
          giftRemain:data.remain,giftIcon:data.gift_info?.webp||data.gift_info?.gif||data.gift_info?.img_basic||'',bizSource:data.biz_source,
          receiver:{...pick(data.receive_user_info,['uid','uname','room_id']),master:data.send_master?pick(data.send_master,['uid','uname','room_id']):undefined},
          blindGift:data.blind_gift?pick(data.blind_gift,BLIND_KEYS):null,
          medal:{...basicMedal(medal),resolvedPerkLevel:perk(sender?.medal?.guard_icon)},wealthMedalLevel:data.wealth_level}));
      }
      case 'SEND_GIFT_V2': {
        if (typeof data.pb !== 'string') return undefined;
        const d=decode('Gift',data.pb), m=d.medal_info, sender=d.sender_uinfo;
        if (!d.gift_item?.length) return [metadata(common('gift',{
          id:`${receivedAt}:${ctx.roomId}:0:0:0`,uid:sender?.uid||d.uid||0,username:sender?.base?.name||d.uname||'',
          avatar:normalizedUrl(sender?.base?.face||d.face),message:'unknown gift',price:0,priceNormalized:0,duration:0,
          coinType:'gold',guardType:number(d.guard_level),giftType:0,giftAction:'',giftAmount:0,giftId:0,giftName:'',giftRemain:0,giftIcon:'',
          bizSource:'Live',receiver:{uid:0,uname:'',master:d.send_master?.uid?{uid:d.send_master.uid,uname:d.send_master.uname||'',room_id:0}:null},
          blindGift:null,medal:{level:number(m?.level),name:m?.name||'',room:0,guardType:number(m?.guard_level),lightened:number(m?.is_lighted),
            uid:m?.ruid||sender?.medal?.ruid||0,resolvedPerkLevel:perk(sender?.medal?.guard_icon)},wealthMedalLevel:number(d.wealth?.level),
        }))];
        return (d.gift_item??[]).map((g:any) => {
          fallback=false;
          const price=number(g.total_coin);
          return metadata(common('gift',{...time(g.timestamp,'seconds'),uid:sender?.uid||d.uid||0,username:sender?.base?.name||d.uname||'',
            avatar:normalizedUrl(sender?.base?.face||d.face),message:g.gift_name||'',price,priceNormalized:price/1000,
            duration:laplaceDurationSeconds(price/1000),coinType:g.coin_type||'gold',guardType:number(d.guard_level),giftType:0,
            giftAction:g.action||'--',giftAmount:g.num||1,giftId:g.gift_id||0,giftName:g.gift_name||'',giftRemain:0,
            id:`${g.timestamp}:${ctx.roomId}:${g.batch_combo_id?str(g.batch_combo_id).split(':').pop():g.timestamp}:${g.gift_id}:${number(g.combo_total_coin||g.total_coin)/1000}`,
            giftIcon:g.gift_info?.webp||g.gift_info?.gif||g.gift_info?.img_basic||'',bizSource:'Live',
            receiver:{uid:g.receive_user_info?.uid||0,uname:g.receive_user_info?.uname||'',
              master:d.send_master?.uid?{uid:d.send_master.uid,uname:d.send_master.uname||'',room_id:0}:null},
            blindGift:d.blind_gift?{...pick(d.blind_gift,BLIND_KEYS),gift_tip_price:number(g.gift_tip_price)||number(d.blind_gift.original_gift_price)}:null,
            medal:{level:number(m?.level),name:m?.name||'',room:0,guardType:number(m?.guard_level),lightened:number(m?.is_lighted),
              uid:m?.ruid||sender?.medal?.ruid||0,resolvedPerkLevel:perk(sender?.medal?.guard_icon)},wealthMedalLevel:number(d.wealth?.level)}),
            g.timestamp===undefined?['timestamp (receipt milliseconds used)']:[]);
        });
      }
      case 'SUPER_CHAT_MESSAGE': {
        const m=data.medal_info, group=data.group_medal;
        return metadata(common('superchat',{...time(data.start_time ?? data.ts,'seconds'),uid:data.uid,username:data.user_info?.uname,
          avatar:normalizedUrl(data.user_info?.face),avatarFrame:data.user_info?.face_frame,message:data.message,
          messageColor:data.message_font_color,messageTrans:data.message_trans,transMark:data.trans_mark,isAudited:data.is_send_audit,
          price:data.price,priceNormalized:data.price,rate:data.rate,duration:data.time,guardType:data.user_info?.guard_level,
          guardBackground:data.background_image,scId:data.id,scName:data.gift?.gift_name,scAmount:data.gift?.num,
          medal:{...basicMedal(m),name:m?.medal_name||group?.name||'',lightened:m?.is_lighted||group?.is_lighted||0,
            type:group?.medal_id&&group?.name&&group?.is_lighted?1:0,resolvedPerkLevel:perk(data.uinfo?.medal?.guard_icon)},deleted:false}));
      }
      case 'SUPER_CHAT_MESSAGE_DELETE': return {sourceCommand:command,sourceMode:'direct',platform:'bilibili',
        timestampUnit:'receipt-milliseconds',timestampFallback:false,deleteIds:(data.data?.ids??data.ids??[]).map(str)};
      case 'USER_TOAST_MSG_V2': {
        const s=data.sender_uinfo,g=data.guard_info,p=data.pay_info,o=data.option;
        const price=p?.price ?? data.price;
        const level=g?.guard_level ?? data.guard_level ?? 0;
        const unit=p?.unit ?? '月';
        return metadata(common('toast',{...time(g?.start_time ?? data.start_time,'seconds'),uid:s?.uid ?? data.uid,username:s?.base?.name ?? data.username,avatar:s?.base?.face,
          message:data.toast_msg ?? '',price,priceNormalized:price == null ? undefined : price/1000,mockPrice:price == null,duration:laplaceDurationSeconds(price == null ? 0 : price/1000),
          color:o?.color,toastType:level,toastAmount:p?.num ?? data.num ?? 1,toastAmountUnit:unit,toastName:g?.role_name ?? ({1:'总督',2:'提督',3:'舰长'} as Record<number,string>)[level] ?? '大航海',
          toastTotalCount:g?.room_guard_count??0,toastId:data.gift_info?.gift_id}));
      }
      case 'USER_VIRTUAL_MVP': return metadata(common('mvp',{...time(data.timestamp,'seconds'),...pick(data,['action','uid']),
        username:data.uname,guardType:data.user_guard_level,message:data.goods_name,price:data.goods_price,
        priceNormalized:data.goods_price/1000,mvpAmount:data.goods_num,mvpIcon:normalizedUrl(data.goods_icon),duration:laplaceDurationSeconds(data.goods_price/1000)}));
      case 'EFFECT_DANMAKU_MSG': {
        const s=data.sender_uinfo,g=data.goods_info;
        return metadata(common('effect-message',{...time(msg.send_time,'milliseconds'),uid:s?.uid,username:s?.base?.name,
          avatar:normalizedUrl(s?.base?.face),guardType:s?.guard?.level||0,medal:{...basicMedal(s?.medal,'user',false),room:s?.medal?.ruid||0,uid:s?.medal?.ruid||0},
          wealthMedalLevel:s?.wealth?.level||0,message:`${g?.action} ${g?.name} ${g?.num} ${g?.prefix} ${g?.text}`,
          messageRaw:{...pick(g,['action','img','name','prefix','text']),num:g?.num?str(g.num).replace('x','×'):''}}));
      }
      case 'ANCHOR_LOT_START': return metadata(common('lottery-start',{...time(data.current_time,'seconds'),duration:data.max_time,
        message:`${data.award_name}：${data.danmu}`,messageToJoin:data.danmu,requirement:data.require_text,rewardName:data.award_name,
        rewardNum:data.award_num,rewardImage:data.award_image,giftName:data.gift_name,giftCount:data.gift_num,giftId:data.gift_id,
        giftPrice:data.gift_price,giftPriceNormalized:data.gift_price/1000}));
      case 'ANCHOR_LOT_AWARD': return metadata(common('lottery-result',{message:'天选时刻中奖名单',rewardName:data.award_name,
        rewardNum:data.award_num,rewardImage:data.award_image,list:(data.award_users??[]).map((u:any)=>pick(u,
          ['uid','uname','face','avatar','level','color','name_color','guard_level'])),priceNormalized:0}));
      case 'POPULARITY_RED_POCKET_START':
      case 'POPULARITY_RED_POCKET_V2_START': {
        const coupon=awards(data.awards).some((a:any)=>a.gift_id===0), total=data.total_price/1000;
        return metadata(common('red-envelope-start',{...time(data.current_time,'seconds'),uid:data.sender_uid,username:data.sender_name,avatar:data.sender_face,
          list:awards(data.awards),price:data.total_price,priceNormalized:coupon?total:total/.8,priceForUsers:total,
          priceForStreamer:coupon?total:total/.8*.2,duration:data.last_time,icon:data.animation_icon_url||data.icon_url,message:data.danmu}));
      }
      case 'POPULARITY_RED_POCKET_WINNER_LIST':
      case 'POPULARITY_RED_POCKET_V2_WINNER_LIST': return metadata(common('red-envelope-result',{message:'红包中奖名单',
        list:(data.winner_info??[]).map((w:any)=>Array.isArray(w)?w.map((v,index) => index===2 ? redPocketWinnerAvatar(w)??null : ['string','number','boolean'].includes(typeof v)?v:null)
          : [w.uid,w.uname,redPocketWinnerAvatar(w)??null,w.gift_id??null]),
        rewards:Array.isArray(data.awards)?awards(data.awards):Object.fromEntries(Object.entries(data.awards??{}).map(([key,v])=>[key,pick(v,
          ['gift_id','gift_name','gift_pic','award_name','award_num','gift_num','num','gift_icon'])])),priceNormalized:0}));
      case 'INTERACT_WORD': {
        const u=data.uinfo, r=data.relation_tail;
        return metadata(common('interaction',{...time(data.trigger_time,'nanoseconds'),uid:data.uid,username:data.uname,action:data.msg_type,
          guardType:data.privilege_type,avatar:normalizedUrl(u?.base?.face),relation:{type:r?.tail_type||0,icon:normalizedUrl(r?.tail_icon),text:r?.tail_guide_text||''},
          wealthMedalLevel:u?.wealth?.level||0,medal:{...basicMedal(data.fans_medal),resolvedPerkLevel:perk(u?.medal?.guard_icon)}}));
      }
      case 'INTERACT_WORD_V2': {
        if (!data.pb) return undefined;
        const d=decode('Interaction',data.pb),m=d.medal,r=d.relation_tail;
        return metadata(common('interaction',{...time(d.trigger_time,'nanoseconds'),uid:d.uid||0,username:d.username||d.uinfo?.base?.username||'',
          avatar:normalizedUrl(d.uinfo?.base?.avatar),action:d.msg_type||1,guardType:number(d.guard_type),
          id:`${d.trigger_time}:${d.room_id||ctx.roomId}:${d.uid||0}`,
          medal:{level:m?.level||0,name:m?.name||'',room:d.room_id||ctx.roomId,uid:m?.ruid||0,guardType:number(m?.guard_level),
            lightened:number(m?.is_lighted)},wealthMedalLevel:number(d.uinfo?.wealth?.level),
          relation:{type:r?.tail_type||0,icon:normalizedUrl(r?.tail_icon),text:r?.tail_guide_text||''}}));
      }
      case 'LIKE_INFO_V3_CLICK': return metadata(common('like-click',{uid:data.uid,username:data.uname,avatar:'',message:data.like_text,
        medal:{...basicMedal(data.fans_medal),resolvedPerkLevel:perk(data.uinfo?.medal?.guard_icon)},guardType:data.uinfo?.guard?.level||0}));
      case 'ROOM_BLOCK_MSG': return metadata(common('user-block',{uid:data.uid,username:data.uname,operator:data.operator,
        blockExpired:data.block_expired?data.block_expired*1000:undefined,vaildPeriod:data.vaild_period}));
      case 'ROOM_CHANGE': return metadata(common('room-name-update',{message:data.title,area:data.area_name,parentArea:data.parent_area_name}));
      case 'ROOM_SILENT_ON':
      case 'ROOM_SILENT_OFF': return metadata(common(command==='ROOM_SILENT_ON'?'room-mute-on':'room-mute-off',{
        message:data.msg,muteBy:data.type,muteLevel:data.level,muteLength:data.second}));
      case 'LIVE': {
        const stamp=time(msg.live_time,'seconds');
        return metadata(common('live-start',{...stamp,timestamp:stamp.timestampNormalized,message:'开播了',initial:msg.live_time!==undefined,
          specialTypes:Array.isArray(msg.special_types)?msg.special_types.filter((v:any)=>typeof v==='string'||typeof v==='number'):undefined}));
      }
      case 'PREPARING': return metadata(common('live-end',{message:'下播了'}));
      case 'WARNING':
      case 'CUT_OFF': return metadata(common(command==='WARNING'?'live-warning':'live-cutoff',{uid:ctx.roomId,message:msg.msg}));
      case 'COMBO_SEND': return {sourceCommand:command,platform:'bilibili',sourceMode:'direct',timestampUnit:'receipt-milliseconds',timestampFallback:false};
      default: return undefined;
    }
  } catch {
    // A compatibility packet must never interrupt native/blivechat adaptation.
    return {sourceCommand:command,platform:'bilibili',sourceMode:isOpen?'open':'direct',timestampUnit:unit,timestampFallback:fallback,
      unavailableFields:['invalid original compatibility payload']};
  }
}
