import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { CoLiveLogo } from './CoLiveLogo';

import { AboutLinks } from './ThirdPartyNotices';

export function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  useUiLanguage();
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
    <form method="dialog" className="about-close"><button autoFocus type="submit" aria-label={uiText("aboutDialog.aria_label")} title={uiText("common.close")}><X size={18} /></button></form>
    {reducedMotion ? <div className="about-character"><CoLiveLogo /></div> : <button type="button" className="about-character" aria-label={uiText("aboutDialog.aria_label2")} title={uiText("aboutDialog.title")} onClick={() => setReplay(value => value + 1)}>
      <CoLiveLogo key={replay} animated />
    </button>}
    <h2 id={title} className="ui-type-display">BB CoLive</h2>
    <p className="about-version ui-type-meta">v{version}</p>
    <p className="about-description ui-type-control">{uiText("aboutDialog.AboutDialog")}</p>
    <AboutLinks />
    <footer className="ui-type-micro">{uiText("aboutDialog.AboutDialog2")}</footer>
  </dialog>, document.body);
}
