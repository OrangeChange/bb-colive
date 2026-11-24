import { getCurrentWindow } from '@tauri-apps/api/window';

export function EventWindowPositionHint({ name, visible, adjustable }: { name: string; visible: boolean; adjustable: boolean }) {
  if (!visible) return null;
  return <div className="event-window-position-hint" aria-hidden="true">
    <span className={`event-window-name ${adjustable ? 'is-adjustable' : ''}`} onMouseDown={event => {
      if (!adjustable || event.button !== 0) return;
      event.preventDefault();
      void getCurrentWindow().startDragging().catch(() => {});
    }}>{name}</span>
  </div>;
}
