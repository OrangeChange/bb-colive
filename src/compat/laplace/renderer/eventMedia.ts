import {getWealthMedalAssetPath} from '../../../wealthMedalAssets.ts';
import previewUsers from '../../../preview/previewUserMedia.json' with {type:'json'};
import previewRooms from '../../../preview/laplace-preview-rooms.json' with {type:'json'};
export const LAPLACE_PREVIEW_DEFAULT_AVATAR = '/media/laplace-preview/avatars/official-default.jpg';
export function laplacePreviewUserAvatar(uid: unknown): string {
 const user=(previewUsers as Record<string,{avatar:string;sourceUrl?:string}>)[String(uid)];
 return user?.sourceUrl ? user.avatar : LAPLACE_PREVIEW_DEFAULT_AVATAR;
}

type MediaEvent = {uid?:unknown;avatar?:unknown;origin?:unknown;giftId?:unknown;giftIcon?:unknown;wealthMedalLevel?:unknown;wealthMedalIcon?:unknown;reply?:any;receiver?:any;list?:any[]};
let avatars=new Map<string,string>(),gifts=new Map<string,string>(),wealth=new Map<string,string>();
let preview=false;
export function setLaplaceEventMedia(events:readonly MediaEvent[],isPreview:boolean){
 const previous=avatars;
 avatars=new Map();gifts=new Map();wealth=new Map();preview=isPreview;
 const add=(uid:unknown,avatar:unknown)=>{if(uid!=null&&typeof avatar==='string'&&avatar)avatars.set(String(uid),avatar)};
 for(const event of events){
  add(event.uid,event.avatar);
  for(const user of[event.reply,event.receiver])if(user)add(user.uid,user.avatar||user.face);
  for(const user of event.list??[])if(Array.isArray(user))add(user[0],user[2]);else if(user)add(user.uid,user.avatar||user.face);
  if(event.giftId!=null&&typeof event.giftIcon==='string'&&event.giftIcon)gifts.set(`${event.origin}:${event.giftId}`,event.giftIcon);
  if(event.wealthMedalLevel&&typeof event.wealthMedalIcon==='string'&&event.wealthMedalIcon)wealth.set(String(event.wealthMedalLevel),event.wealthMedalIcon);
 }
 for(const event of events)for(const user of mediaUsers(event)){const uid=String(user.uid);if(!avatars.has(uid)&&previous.has(uid))avatars.set(uid,previous.get(uid)!);}
}
function mediaUsers(event:MediaEvent):{uid:unknown;avatar?:unknown;isRoom?:boolean}[]{
 return [event,event.reply,event.receiver,...(event.list??[]).map(user=>Array.isArray(user)?{uid:user[0],avatar:user[2]}:user)].filter(user=>user?.uid!=null) as {uid:unknown;avatar?:unknown}[];
}
export function laplaceAvatarMediaKey(user:{uid:unknown;avatar?:unknown;isRoom?:boolean}):string{
 const supplied=typeof user.avatar==='string'?user.avatar:'';
 return supplied||resolveLaplaceEventMedia(`https://workers.laplace.cn/bilibili/avatar/${user.uid}${user.isRoom?'?isRoom=1':''}`)||'';
}
export function laplaceEventMediaSources(event:MediaEvent):string[]{
 return [...mediaUsers(event).map(laplaceAvatarMediaKey),
  resolveLaplaceEventMedia(`https://workers.laplace.cn/bilibili/room-gift-config/${event.origin}?gift=${event.giftId}`)||'',
  resolveLaplaceEventMedia(`https://workers.laplace.cn/bilibili/wealth-config?level=${event.wealthMedalLevel}`)||''];
}
export function resolveLaplaceEventMedia(raw:string):string|undefined{
 if(raw.startsWith('/media/'))return raw.replace(/@\d+(?:\.\d+)?w_\d+(?:\.\d+)?h$/,'');
 if(!raw.startsWith('https://workers.laplace.cn/bilibili/'))return;
 const url=new URL(raw),avatar=url.pathname.match(/^\/bilibili\/avatar\/(\d+)$/);
 if(avatar){
  if(url.searchParams.get('isRoom')==='1')return preview ? (previewRooms as Record<string,{avatar:string}>)[avatar[1]]?.avatar ?? LAPLACE_PREVIEW_DEFAULT_AVATAR : undefined;
  return preview ? laplacePreviewUserAvatar(avatar[1]) : avatars.get(avatar[1]);
 }
 if(url.pathname==='/bilibili/wealth-config')return wealth.get(url.searchParams.get('level')??'')??getWealthMedalAssetPath(Number(url.searchParams.get('level')));
 const room=url.pathname.match(/^\/bilibili\/room-gift-config\/(\d+)$/);
 if(room)return gifts.get(`${room[1]}:${url.searchParams.get('gift')}`);
}
