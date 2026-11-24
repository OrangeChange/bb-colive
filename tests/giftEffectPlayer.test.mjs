import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { componentRuntime, findElement } from "./helpers/componentRuntime.mjs";
import { createGiftEffectQueue } from "../src/windows/giftEffectQueue.ts";

test("配置下载失败结束当前播放，后续资源仍可启动", async () => {
  let errors = 0;
  const configurations = [];
  const request = mock.method(globalThis, "fetch", async url => {
    if (String(url).includes("bad")) throw new Error("unavailable");
    return { ok: true, json: async () => ({ info: { w: 100, h: 100, f: 20, fps: 20 } }) };
  });
  const runtime = componentRuntime("src/windows/giftEffectPlayer.ts", {
    "video-animation-player": { default: options => { configurations.push(options.config); return { once() {}, destroy() {} }; } },
    "../diagnostics/diagnosticLogger.ts": { getDiagnosticContext: () => ({ record() {} }) },
    "../diagnostics/featureDiagnostics.ts": { recordFeatureDiagnostic() {} },
  });
  const stage = { style: {setProperty(){}}, ownerDocument: { createElement: () => ({ remove() {} }) }, replaceChildren() {} };
  const player = runtime.exports.createGiftEffectPlayer();
  player.on("error", () => errors++);
  try {
    player.play({ webMp4: "effect.mp4", webMp4Json: "bad.json" }, stage);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(errors, 1);
    assert.equal(configurations.length, 0);
    player.play({ webMp4: "effect.mp4", webMp4Json: "good.json" }, stage);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(configurations.length, 1);
    assert.equal(typeof configurations[0], "object");
  } finally { player.destroy(); request.mock.restore(); runtime.close(); }
});

test("切房取消当前特效与等待队列，A→B→A 不回放旧通知", () => {
  const played = [];
  let destroyed = 0;
  const player = { play: (resource) => played.push(resource.webMp4), destroy: () => { destroyed++; }, on: () => () => {} };
  const app = componentRuntime("src/components/GiftEffectOverlay.tsx", {
    "../windows/giftEffectPlayer": { createGiftEffectPlayer: () => player },
    "../windows/giftEffectQueue": { createGiftEffectQueue },
  });
  const notice = (id) => ({ event: { id }, resource: { webMp4: `${id}.mp4` } });
  const render = (roomKey, notices) => {
    const tree = app.render("GiftEffectOverlay", { enabled: true, roomKey, notices });
    findElement(tree, (node) => node.props.className === "gift-effect-viewport").props.ref.current = {};
    app.effects();
  };
  try {
    render("A", [notice("A-current"), notice("A-pending")]);
    assert.deepEqual(played, ["A-current.mp4"]);
    render("B", []);
    assert.equal(destroyed, 1);
    render("B", [notice("B-current")]);
    assert.deepEqual(played, ["A-current.mp4", "B-current.mp4"]);
    render("A", []);
    assert.equal(destroyed, 2);
    render("A", [notice("A-new")]);
    assert.deepEqual(played, ["A-current.mp4", "B-current.mp4", "A-new.mp4"]);
  } finally { app.close(); }
});

test("礼物特效播放器适配官方 VAP 资源", async () => {
  const source = await readFile(new URL("../src/windows/giftEffectPlayer.ts", import.meta.url), "utf8");
  assert.match(source, /video-animation-player/);
  assert.match(source, /mute:\s*true/);
  assert.match(source, /loop:\s*false/);
  assert.match(source, /webMp4Json/);
  assert.match(source, /ended/);
  assert.match(source, /onLoadError/);
});

test("礼物特效使用资源原始比例，不把容器宽高传给 VAP", async () => {
  const source = await readFile(new URL("../src/windows/giftEffectPlayer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const width = Math\.max\(1, Math\.floor\(container\.clientWidth\)\)/);
  assert.doesNotMatch(source, /const height = Math\.max\(1, Math\.floor\(container\.clientHeight\)\)/);
  assert.doesNotMatch(source, /\n\s*width,\n\s*height,\n/);
});

test("连续播放时隔离旧 VAP 画布，避免同一视口残留多个画布", async () => {
  const source = await readFile(new URL("../src/windows/giftEffectPlayer.ts", import.meta.url), "utf8");
  assert.match(source, /gift-effect-player-host/);
  assert.match(source, /container\.replaceChildren\(host\)/);
  assert.match(source, /playerHost\?\.remove\(\)/);
});

test("礼物特效默认使用 3:4 视口，大航海可按素材覆盖比例", async () => {
  const overlay = await readFile(new URL("../src/components/GiftEffectOverlay.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(overlay, /ref=\{stageRef\}\s+className="gift-effect-viewport"/);
  assert.match(css, /\.gift-effect-stage\s*\{[\s\S]*container-type:\s*size;[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/);
  assert.match(css, /\.gift-effect-viewport\s*\{[\s\S]*width:\s*min\(92cqw,\s*520px,\s*calc\(92cqh \* var\(--gift-effect-aspect-ratio, 0\.75\)\)\);[\s\S]*aspect-ratio:\s*var\(--gift-effect-aspect-ratio, 0\.75\);[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.gift-effect-viewport canvas\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;[\s\S]*object-position:\s*center\s+50%;/);
});

test("大航海昵称填入官方文字槽，普通礼物不注入昵称",async()=>{
 const seen=[];const request=mock.method(globalThis,"fetch",async()=>({ok:true,json:async()=>({info:{w:720,h:1280},src:[{srcType:"txt",srcTag:"live.guard.open.animation.user.name"}]})}));
 const runtime=componentRuntime("src/windows/giftEffectPlayer.ts",{"video-animation-player":{default:options=>{seen.push(options);return{once(){},destroy(){}}}},"../diagnostics/diagnosticLogger.ts":{getDiagnosticContext:()=>({record(){}})},"../diagnostics/featureDiagnostics.ts":{recordFeatureDiagnostic(){}}});
 const player=runtime.exports.createGiftEffectPlayer();const stage={style:{setProperty(){}},ownerDocument:{createElement:()=>({remove(){}})},replaceChildren(){}};
 try{player.play({webMp4:"guard.mp4",webMp4Json:"guard.json",username:"测试昵称"},stage);await new Promise(r=>setTimeout(r,0));assert.equal(seen[0]["live.guard.open.animation.user.name"],"测试昵称");player.destroy();player.play({webMp4:"gift.mp4",webMp4Json:"gift.json"},stage);await new Promise(r=>setTimeout(r,0));assert.equal(seen[1]["live.guard.open.animation.user.name"],undefined)}finally{player.destroy();request.mock.restore();runtime.close()}
});

test("切换大航海开关保留手动礼物等待项",()=>{
 const played=[],listeners={};const player={play:r=>played.push(r.webMp4),destroy(){},on:(name,fn)=>{listeners[name]=fn;return()=>{}}};
 const app=componentRuntime("src/components/GiftEffectOverlay.tsx",{"../windows/giftEffectPlayer":{createGiftEffectPlayer:()=>player},"../windows/giftEffectQueue":{createGiftEffectQueue}});
 const notices=[1,2].map(id=>({event:{id},resource:{webMp4:`${id}.mp4`},manual:true}));
 const render=guardEnabled=>{const tree=app.render("GiftEffectOverlay",{enabled:false,guardEnabled,roomKey:1,notices});findElement(tree,n=>n.props.className==="gift-effect-viewport").props.ref.current={};app.effects()};
 try{render(true);render(false);listeners.ended();assert.deepEqual(played,["1.mp4","2.mp4"])}finally{app.close()}
});

test("竖向大航海素材保持官方宽高比",async()=>{
 const ratios=[];const request=mock.method(globalThis,"fetch",async()=>({ok:true,json:async()=>({info:{w:720,h:1280}})}));
 const runtime=componentRuntime("src/windows/giftEffectPlayer.ts",{"video-animation-player":{default:()=>({once(){},destroy(){}})},"../diagnostics/diagnosticLogger.ts":{getDiagnosticContext:()=>({record(){}})},"../diagnostics/featureDiagnostics.ts":{recordFeatureDiagnostic(){}}});const player=runtime.exports.createGiftEffectPlayer();
 try{player.play({webMp4:"guard.mp4",webMp4Json:"guard.json",username:"昵称"},{style:{setProperty:(name,value)=>ratios.push([name,value])},ownerDocument:{createElement:()=>({remove(){}})},replaceChildren(){}});await new Promise(r=>setTimeout(r,0));assert.deepEqual(ratios,[["--gift-effect-aspect-ratio","0.5625"]])}finally{player.destroy();request.mock.restore();runtime.close()}
});
