import { useEffect, useState, type CSSProperties } from 'react';
import { UserRound } from 'lucide-react';
import type { DanmakuUser } from '../protocol/types';
import { DEFAULT_AVATAR_PATH, guardAvatarFramePath } from '../eventMediaAssets';
import { publicGuardLevel } from '../events/publicEventStyle';
import './UserAvatar.css';

export type AvatarUser = Pick<DanmakuUser, 'avatar' | 'guardLevel' | 'guardMilestone' | 'guardIconSet'>;

export function UserAvatar({ user, showAvatar = true, showAvatarFrame = true, size, className = '' }: {
  user?: AvatarUser;
  showAvatar?: boolean;
  showAvatarFrame?: boolean;
  size?: number;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [frameFailedSource, setFrameFailedSource] = useState<string | null>(null);
  const avatar = user?.avatar;
  const source = avatar && failedSource !== avatar ? avatar : DEFAULT_AVATAR_PATH;
  const frame = guardAvatarFramePath(user);
  useEffect(() => setFailedSource(null), [avatar]);
  useEffect(() => setFrameFailedSource(null), [frame]);
  if (!showAvatar || !user) return null;
  return <span className={`user-avatar avatar-wrap inline-flex shrink-0 items-center justify-center${showAvatarFrame && frame ? ' event-avatar-framed' : ''}${className ? ` ${className}` : ''}`}
    style={size === undefined ? undefined : { '--avatar-size': `${size}px` } as CSSProperties}>
    {failedSource === DEFAULT_AVATAR_PATH
      ? <span className="avatar-placeholder event-avatar-placeholder shrink-0 rounded-full" role="img" aria-label="头像不可用"><UserRound width="58%" height="58%" aria-hidden="true" /></span>
      : <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" className="avatar event-avatar shrink-0 rounded-full object-cover" onError={() => setFailedSource(source)} />}
    {showAvatarFrame && frame && frameFailedSource !== frame && <img src={frame} alt="" loading="lazy" className="avatar-frame" data-level={publicGuardLevel(user.guardLevel)} onError={() => setFrameFailedSource(frame)} />}
  </span>;
}
