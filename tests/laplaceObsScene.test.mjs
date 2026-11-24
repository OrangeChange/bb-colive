import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLaplaceObsScene,subscribeLaplaceObsScene} from '../src/obs/laplaceObsScene.ts';
test('OBS 场景标记解析及无标记回退',()=>{
 assert.deepEqual(parseLaplaceObsScene('游戏 [dark] [scene:gaming]'),{sceneName:'gaming',dark:true});
 assert.deepEqual(parseLaplaceObsScene('聊天'),{dark:false});
 for(const marker of ['[scene:blue]','[scene: blue]','[ scene : blue ]'])assert.deepEqual(parseLaplaceObsScene(marker+' [dark]'),{sceneName:'blue',dark:true});
 assert.deepEqual(parseLaplaceObsScene('[scene:chit-chat]'),{sceneName:'chit-chat',dark:false});
 assert.deepEqual(parseLaplaceObsScene('[dark]'),{dark:true});
});
test('场景监听首次读取、更新、释放与无权限',()=>{
 const target=new EventTarget();let initial;
 target.obsstudio={getControlLevel:callback=>callback(2),getCurrentScene:callback=>{initial=callback;}};
 const received=[];const stop=subscribeLaplaceObsScene(target,value=>received.push(value));
 initial({name:'聊天'});
 const change=new Event('obsSceneChanged');change.detail={name:'游戏 [dark] [scene:gaming]'};target.dispatchEvent(change);
 assert.deepEqual(received,[{dark:false},{sceneName:'gaming',dark:true}]);
 stop();target.dispatchEvent(change);assert.equal(received.length,2);
 const denied=new EventTarget();denied.obsstudio={getControlLevel:callback=>callback(1),getCurrentScene(){assert.fail('不应读取未授权场景');}};
 subscribeLaplaceObsScene(denied,()=>assert.fail());denied.dispatchEvent(change);
});
