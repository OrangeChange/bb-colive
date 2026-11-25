import {createRoot} from 'react-dom/client';
import {mockIPC,mockWindows} from '@tauri-apps/api/mocks';
import {ObsServiceSettings} from '../../src/obs/ObsServiceSettings.tsx';
import {useGeneralSettings} from '../../src/generalSettings.ts';
import '../../src/shadcn.css';
import '../../src/components/themeWorkspace.css';
import '../../src/components/nativeThemeEditor.css';
mockWindows('main');mockIPC(command=>command==='obs_service_status'?{running:true,port:17920,clients:0}:command==='plugin:event|listen'?1:null);
if(!sessionStorage.getItem('obs-settings-seeded')){useGeneralSettings.setState({showObsGiftEffect:false,showLiveGiftEffect:true,showGiftWindowEffect:true});sessionStorage.setItem('obs-settings-seeded','true');}
function App(){const s=useGeneralSettings();return <div style={{width:360}}><ObsServiceSettings/><output hidden>{JSON.stringify({obs:s.showObsGiftEffect,live:s.showLiveGiftEffect,window:s.showGiftWindowEffect})}</output></div>}
createRoot(document.getElementById('root')!).render(<App/>);
