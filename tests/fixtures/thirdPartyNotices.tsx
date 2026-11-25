import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/shadcn.css';
import { AboutDialog } from '../../src/components/AboutDialog';
import { initTheme } from '../../src/theme';
initTheme();
function Fixture() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>关于 BB CoLive</button>{open && <AboutDialog version="1.0.0" onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
