import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../src/eventDisplaySettings.ts';
import {createServer} from 'vite';
import {getNativeEventSample} from './fixtures/nativeEventSamples.ts';
const server=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeHonorAvatar.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,server:{middlewareMode:true,watch:null},logLevel:'silent'});
try {
 const {EventRow}=await server.ssrLoadModule('/src/components/EventRow.tsx');
 const event=structuredClone(getNativeEventSample('honor'));
 event.broadcaster={uid:'3546635395139954',uname:'白水Jimmy',avatar:'/media/native-preview/asset-034.jpg',guardLevel:0,isAnchor:true};
 const html=renderToStaticMarkup(React.createElement(EventRow,{ev:event,liveLayout:true,showTime:false}));
 assert.match(html,/asset-034.jpg/, '荣誉事件应显示主播头像');
 const archive=renderToStaticMarkup(React.createElement(EventRow,{ev:event,reviewLayout:true,archiveLayout:true,showTime:false}));
 assert.match(archive,/asset-034.jpg/, '回看显示相同主播头像');
 const hidden=renderToStaticMarkup(React.createElement(EventRow,{ev:event,liveLayout:true,showTime:false,displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showAvatar:false}}));
 assert.doesNotMatch(hidden,/asset-034.jpg/,'头像开关应覆盖荣誉头像');
 const missing=renderToStaticMarkup(React.createElement(EventRow,{ev:{...event,broadcaster:undefined},liveLayout:true,showTime:false}));
 assert.doesNotMatch(missing,/avatar-wrap/,'缺少主播资料时不生成空头像');
 console.log('荣誉头像、关闭头像、缺少资料及回看隔离通过');
} finally {await server.close();}
