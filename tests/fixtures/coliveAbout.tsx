import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/shadcn.css';
import { AboutDialog } from '../../src/components/AboutDialog';
import { CoLiveLogo } from '../../src/components/CoLiveLogo';
import { initTheme } from '../../src/theme';
import { FloatingEventWindow } from '../../src/windows/FloatingEventWindow';
import { nativeEventBrowserPorts as ports } from '../helpers/nativeEventBrowserPorts';
import { DEFAULT_EVENT_WINDOW_PREFERENCES } from '../../src/windows/eventWindowPreferences';

if (new URLSearchParams(location.search).has('floating')) {
  document.documentElement.dataset.window = 'display';
  initTheme();
  await ports.listen('display:ready', async () => {
    await ports.emitTo('display', 'event-window:preferences', {...DEFAULT_EVENT_WINDOW_PREFERENCES, appearance:{...DEFAULT_EVENT_WINDOW_PREFERENCES.appearance,material:'transparent'}});
    await ports.emitTo('display', 'display:lock', false);
    await ports.emitTo('display', 'display:ready-ack');
  }, 'main');
  createRoot(document.getElementById('root')!).render(<StrictMode><FloatingEventWindow kind="display" /></StrictMode>);
  Object.assign(window, { colivePorts:ports });
} else {
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [updates, setUpdates] = useState(0);
    useEffect(() => { const timer = setInterval(() => setUpdates(value => value + 1), 50); return () => clearInterval(timer); }, []);
    return <><span aria-hidden="true">{updates}</span><button onClick={() => setOpen(true)}>关于 danmu-app</button><CoLiveLogo /><CoLiveLogo />{open && <AboutDialog version="0.5.3" onClose={() => setOpen(false)} />}</>;
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
}
