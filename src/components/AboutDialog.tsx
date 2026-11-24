import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { CoLiveLogo } from './CoLiveLogo';

import { AboutLinks } from './ThirdPartyNotices';

export function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [replay, setReplay] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return createPortal(<dialog ref={dialog} className="about-dialog ui-modal-surface" aria-labelledby={title} onClose={event => { if (!event.currentTarget.open) onClose(); }}>
    <form method="dialog" className="about-close"><button autoFocus type="submit" aria-label="关闭关于" title="关闭"><X size={18} /></button></form>
    {reducedMotion ? <div className="about-character"><CoLiveLogo /></div> : <button type="button" className="about-character" aria-label="重播角色动画" title="重播动画" onClick={() => setReplay(value => value + 1)}>
      <CoLiveLogo key={replay} animated />
    </button>}
    <h2 id={title} className="ui-type-display">BB CoLive</h2>
    <p className="about-version ui-type-meta">v{version}</p>
    <p className="about-description ui-type-control">懂你的直播伙伴。</p>
    <AboutLinks />
    <footer className="ui-type-micro">© 2026 橙橙子君 Orange</footer>
  </dialog>, document.body);
}
