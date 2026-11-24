import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test('全部恢复使用同一工作区与弹幕目标，收益列不读取恢复中的旧窗口位置', async () => {
  const source=read('src/App.tsx');
  const tree=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let declaration;
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='resetAllWindowLayout') declaration=node.getText(tree);ts.forEachChild(node,visit);};
  visit(tree);
  const calls=[];
  const area={x:0,y:0,width:1000,height:1000,scaleFactor:1};
  const dependencies={useCallback:fn=>fn,resetWindowLayout:async()=>{},readCurrentMonitorWorkArea:async()=>area,
    createDefaultWindowPair:()=>({display:{x:630,y:10,width:360,height:360,center:false}}),
    toPhysicalWindowPlacement:value=>value,
    resetDisplayWindowGeometry:async(...args)=>calls.push(['display',...args]),resetGiftWindowGeometry:async(...args)=>calls.push(['revenue',...args])};
  const code=ts.transpileModule(`const ${declaration};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const reset=new Function(...Object.keys(dependencies),`${code};return resetAllWindowLayout;`)(...Object.values(dependencies));
  await reset();
  assert.deepEqual(calls,[['display',area],['revenue',area,{x:630,y:10,width:360,height:360,center:false}]]);
});

test("设置提供独立的默认窗口布局恢复入口", () => {
  const panel = read("src/components/SettingsPanel.tsx");
  const workbench = read("src/components/RightWorkbench.tsx");
  const app = readApplicationSources();
  const channels = read("src/windows/eventWindowChannels.ts");
  assert.match(panel, /主窗口布局/);
  assert.match(panel, /弹幕窗布局/);
  assert.match(panel, /收益窗布局/);
  assert.match(panel, /onResetWindowLayout/);
  assert.match(panel, /onResetDisplayWindowLayout/);
  assert.match(panel, /onResetGiftWindowLayout/);
  assert.match(workbench, /onResetWindowLayout/);
  assert.match(workbench, /handleResetWindowLayout/);
  assert.match(app, /resetDisplayWindowGeometry/);
  assert.match(app, /resetGiftWindowGeometry/);
  const mainResetStart = app.indexOf("const resetWindowLayout = useCallback");
  const mainResetEnd = app.indexOf("const resetDisplayWindowLayout", mainResetStart);
  assert.notEqual(mainResetStart, -1);
  assert.notEqual(mainResetEnd, -1);
  assert.doesNotMatch(app.slice(mainResetStart, mainResetEnd), /resetDisplayWindowGeometry|resetGiftWindowGeometry/);
  assert.match(channels, /RESET_GEOMETRY/);
});

test("主窗口恢复、两个副窗口恢复分别提供独立入口", () => {
  const app = readApplicationSources();
  const workbench = read("src/components/RightWorkbench.tsx");
  assert.match(app, /const resetDisplayWindowLayout = useCallback/);
  assert.match(app, /const resetGiftWindowLayout = useCallback/);
  assert.match(workbench, /onResetDisplayWindowLayout/);
  assert.match(workbench, /onResetGiftWindowLayout/);
});

test("工作台在欢迎页保持挂载，样式页复用工作台预览", () => {
  const app = readApplicationSources();
  const workbench = read("src/components/RightWorkbench.tsx");
  assert.match(app, /active=\{phase === "loggedIn"\}/);
  assert.doesNotMatch(app, /active=\{phase === "loggedIn" && mainView !== "style"\}/);
  assert.match(workbench, /active: boolean/);
  assert.match(workbench, /if \(!active && expanded\)/);
});
