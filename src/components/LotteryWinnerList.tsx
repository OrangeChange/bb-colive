import { useState } from 'react';
import type { LotteryInfo } from '../protocol/types';
import { UserAvatar } from './UserAvatar';

type Winner = NonNullable<LotteryInfo['winners']>[number];

export function LotteryWinnerList({ winners, totalCount, showAvatar = true, onWinnerFilter }: {
  winners?: Winner[];
  totalCount?: number;
  showAvatar?: boolean;
  onWinnerFilter?: (winner: Winner) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!winners?.length) return null;
  return <details className={`winner-list${expanded ? " is-expanded" : ""}`} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="winner-list-toggle" aria-label={`中奖名单（${winners.length}人）`}>
      <span className="winner-list-expand">名单</span>
      <span className="winner-list-collapse">收起</span>
    </summary>
    {totalCount !== undefined && totalCount > winners.length && <span className="winner-list-count">已收到 {winners.length} 人名单</span>}
    <ul className="winner-list-items" aria-label="已收到的中奖名单">
      {winners.map((winner, index) => {
        const label = winner.uname || (winner.uid ? `UID ${winner.uid}` : '未知用户');
        return <li className="winner-list-item" key={`${winner.uid}:${index}`}>
          <UserAvatar user={{avatar:winner.avatar,guardLevel:0}} showAvatar={showAvatar} showAvatarFrame={false} className="winner-avatar" />
          {winner.uid && onWinnerFilter ? <button type="button" className="username" title={`按用户筛选：${label}`} aria-label={`筛选该用户：${label}`}
            onClick={() => onWinnerFilter(winner)}>{label}</button> : <span className="username">{label}</span>}
        </li>;
      })}
    </ul>
  </details>;
}
