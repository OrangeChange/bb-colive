import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useId, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./shadcn/dialog";
import { X } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { CoLiveLogo } from './CoLiveLogo';

import { AboutLinks } from './ThirdPartyNotices';

export function AboutDialog({ version, onClose }: { version: string; onClose: () => void }) {
  useUiLanguage();
  const title = useId();
  const [replay, setReplay] = useState(0);
  const reducedMotion = useReducedMotion();
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent asChild showCloseButton={false} className="max-w-none"><section className="about-dialog ui-modal-surface">
    <div className="about-close"><Button variant="outline" autoFocus type="button" onClick={onClose} aria-label={uiText("aboutDialog.aria_label")} title={uiText("common.close")}><X size={18} /></Button></div>
    {reducedMotion ? <div className="about-character"><CoLiveLogo /></div> : <Button variant="ghost" type="button" className="about-character" aria-label={uiText("aboutDialog.aria_label2")} title={uiText("aboutDialog.title")} onClick={() => setReplay(value => value + 1)}>
      <CoLiveLogo key={replay} animated />
    </Button>}
    <DialogTitle asChild><h2 id={title} className="ui-type-display">BB CoLive</h2></DialogTitle>
    <p className="about-version ui-type-meta">v{version}</p>
    <DialogDescription asChild><p className="about-description ui-type-control">{uiText("aboutDialog.AboutDialog")}</p></DialogDescription>
    <AboutLinks />
    <footer className="ui-type-micro">{uiText("aboutDialog.AboutDialog2")}</footer>
  </section></DialogContent></Dialog>;
}
