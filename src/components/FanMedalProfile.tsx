import { useEventOverlayGeometry, useEventOverlayPortal, placeEventOverlay, type OverlayRect } from "./eventOverlayGeometry";
import { useState, useRef, useLayoutEffect, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound, Radio, RotateCw } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getMasterInfo } from '../protocol/api';
import type { FanMedalInfo } from '../protocol/types';
import { useSession } from '../stores/session';
import { useUiLanguage } from '../i18n/react';
import { uiText } from '../i18n';
import { formatUiNumber } from '../i18n/format';
import { Button } from './shadcn/button';
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './shadcn/popover';
import { ImagePreviewOverlay } from './ImagePreviewOverlay';
import { UserAvatar } from './UserAvatar';

function AnchorProfileContent({ medal, onPreview }: { medal: FanMedalInfo; onPreview: (src: string, name: string) => void }) {
  useUiLanguage();
  const cookie = useSession(s => s.session?.cookie);
  const uid = medal.anchorUid && /^[1-9]\d*$/.test(medal.anchorUid) ? medal.anchorUid : undefined;
  const query = useQuery({
    queryKey: ['anchor-profile', uid],
    queryFn: () => getMasterInfo(uid!, cookie),
    enabled: Boolean(uid),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [linkError, setLinkError] = useState(false);
  const name = query.data?.uname || medal.anchorName || uiText('fanMedalProfile.unknown');
  const face = query.data?.face;
  const roomId = query.data?.roomId || medal.anchorRoomId;
  const open = (url: string) => { setLinkError(false); void openUrl(url).catch(() => setLinkError(true)); };
  return <>
    <div className="fan-medal-profile-row flex min-w-0 items-center gap-2">
      <Button variant="ghost" size={null} type="button" disabled={!face}
        className="size-6 shrink-0 rounded-full border-0 bg-transparent p-0"
        aria-label={uiText('fanMedalProfile.avatar', { name })} title={uiText('eventContextMenu.title3')}
        onClick={() => { if (face) onPreview(face, name); }}>
        <UserAvatar user={{ avatar: face, guardLevel: 0 }} size={24} showAvatarFrame={false} />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col ui-type-control">
        <span className="break-words font-normal text-t1">{name}</span>
        <span className="text-t3">
          {!uid ? uiText('fanMedalProfile.unavailable') : query.isPending ? uiText('fanMedalProfile.loading') : query.isError ?
            <Button variant="ghost" size={null} className="h-auto justify-start gap-1 border-0 p-0 text-t3" onClick={() => void query.refetch()}><RotateCw className="size-3" />{uiText('fanMedalProfile.retry')}</Button> :
            uiText('fanMedalProfile.followers', { count: query.data?.followerCount === undefined ? '—' : formatUiNumber(query.data.followerCount) })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={!uid} aria-label={uiText('fanMedalProfile.profile')} title={uiText('fanMedalProfile.profile')}
          onClick={() => { if (uid) open(`https://space.bilibili.com/${uid}`); }}><UserRound className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" disabled={!roomId} aria-label={uiText('fanMedalProfile.room')} title={uiText('fanMedalProfile.room')}
          onClick={() => { if (roomId) open(`https://live.bilibili.com/${roomId}`); }}><Radio className="size-4" /></Button>
      </div>
    </div>
    {linkError && <span className="ui-type-control text-t3">{uiText('fanMedalProfile.linkError')}</span>}
  </>;
}

export function FanMedalProfile({ medal, children, anchor, getAnchorRect, onClose }: {
  medal: FanMedalInfo;
  children?: ReactElement;
  anchor?: { left: number; top: number; width: number; height: number };
  getAnchorRect?: () => OverlayRect | null;
  onClose?: () => void;
}) {
  useUiLanguage();
  const [open, setOpen] = useState(Boolean(anchor));
  const [preview, setPreview] = useState<{src: string; name: string} | null>(null);
  const trigger = useRef<HTMLElement>(null);
  const geometry = useEventOverlayGeometry(open, trigger, {getAnchorRect, onDetach: () => {setOpen(false); onClose?.();}});
  const overlayPortal = useEventOverlayPortal(open, geometry?.boundary);
  const contentRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({alignOffset:0,sideOffset:4,ready:false});
  useLayoutEffect(() => {
    if(!open){setPlacement(old=>old.ready?{...old,ready:false}:old);return;}
    const content=contentRef.current;
    if(!geometry || !content)return;
    const update=()=>{
      const next=placeEventOverlay(geometry.anchor,content.offsetWidth,content.offsetHeight,geometry.boundary,{left:geometry.anchor.left,top:geometry.anchor.bottom+4});
      const value={alignOffset:next.left-geometry.anchor.left,sideOffset:next.top-geometry.anchor.bottom,ready:true};
      setPlacement(old=>old.ready&&old.alignOffset===value.alignOffset&&old.sideOffset===value.sideOffset?old:value);
    };
    update();const observer=new ResizeObserver(update);observer.observe(content);return()=>observer.disconnect();
  },[open,geometry,overlayPortal]);
  const anchorBox = geometry?.anchor ?? anchor;
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) onClose?.(); };
  return <>
    <Popover open={open} onOpenChange={changeOpen}>
      {anchor ? <PopoverAnchor asChild><span ref={node => {trigger.current = node;}} style={{position:'fixed',left:anchorBox!.left,top:anchorBox!.top,width:anchorBox!.width,height:anchorBox!.height,pointerEvents:'none'}} /></PopoverAnchor> :
        <PopoverTrigger ref={node => {trigger.current=node;}} asChild>{children}</PopoverTrigger>}
      {overlayPortal && <PopoverContent ref={contentRef} container={overlayPortal!} align="start" side="bottom" alignOffset={placement.alignOffset} sideOffset={placement.sideOffset} avoidCollisions={false}
        style={{visibility: geometry && placement.ready ? 'visible' : 'hidden', maxWidth: geometry ? Math.max(1, geometry.boundary.width - 16) : undefined,
          maxHeight: geometry ? Math.max(1, geometry.boundary.height - 16) : undefined, overflowY: 'auto',overscrollBehavior:'contain',pointerEvents:'auto'}} aria-label={uiText('fanMedalProfile.title')}
        className="fan-medal-profile w-72 max-w-[calc(100vw-16px)] font-normal"
        onWheel={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
        onCloseAutoFocus={e => { if (preview) e.preventDefault(); }}>
        {open && <AnchorProfileContent medal={medal} onPreview={(src, name) => { setPreview({src,name}); setOpen(false); }} />}
      </PopoverContent>}
    </Popover>
    {preview && <ImagePreviewOverlay open src={preview.src} alt={preview.name} label={preview.name}
      closeLabel={uiText('eventContextMenu.closeLabel')} variant="avatar" restoreFocusRef={trigger}
      onClose={() => { setPreview(null); if (anchor) onClose?.(); }} />}
  </>;
}
