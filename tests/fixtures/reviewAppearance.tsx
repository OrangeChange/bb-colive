import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReviewStyleSettings} from '../../src/components/ReviewStyleSettings';
import {EventRow} from '../../src/components/EventRow';
import {useGeneralSettings} from '../../src/generalSettings';
import {getNativeEventSample} from './nativeEventSamples';
const sample=getNativeEventSample('text');
const ev={...sample,user:{...sample.user,uname:'身份与粉丝牌',guardLevel:3 as const,isAnchor:true,isAdmin:true,wealthLevel:25,medal:{name:'粉丝牌',level:42,isLighted:true}}};
function App(){return <><ReviewStyleSettings/><div className="event-area review"><EventRow ev={ev} reviewLayout animateOnMount={false}/></div></>}
createRoot(document.getElementById('root')!).render(<App/>);
Object.assign(window,{reviewSettings:useGeneralSettings});

