import rooms from './laplace-preview-rooms.json' with {type:'json'};
import profiles from './previewUserMedia.json' with {type:'json'};
import type {DanmakuEvent} from '../protocol/types.ts';

export function previewUserAvatar(uid:unknown):string|undefined{
 return (profiles as Record<string,{avatar:string}>)[String(uid)]?.avatar;
}
/** Fill missing nested portraits in an already cloned preview record. */
export function completePreviewEventMedia(event:DanmakuEvent):void{
 const fill=(user:any)=>{if(user?.uid!=null&&!user.avatar){const avatar=previewUserAvatar(user.uid);if(avatar)user.avatar=avatar}};
 const winners=(list:any[])=>{for(const user of list){if(Array.isArray(user)){if(!user[2])user[2]=previewUserAvatar(user[0])??user[2]}else fill(user)}};
 const host=(rooms as Record<string,{uid:string;avatar:string}>)[String(event.roomId)];
 if(event.msgType===4&&host&&!event.broadcaster)event.broadcaster={uid:host.uid,uname:"",avatar:host.avatar,guardLevel:0,isAnchor:true};
 fill(event.user);fill(event.replyTo);winners(event.lottery?.winners??[]);
 const source=event.laplace?.event as any;
 if(source){fill(source);fill(source.reply);fill(source.receiver);winners(source.list??[]);}
}
