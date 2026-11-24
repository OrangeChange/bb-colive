import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('开放版静态消费者的布局与对齐共用同一来源节点，不重复搬移触发观察器',()=>{
 const source=fs.readFileSync('src/compat/openlive/runtime/entry.mjs','utf8');const body=source.slice(source.indexOf('function syncPresentation(){'),source.indexOf('function postScrollState('));
 const row={dataset:{compatibleEventId:'static:1'}};let moves=0;const items={children:[row],querySelectorAll(){return[];},appendChild(fragment){moves++;this.children=[...new Set(fragment.nodes)];}};
 const context={presentedRows:new WeakSet([row]),syncingPresentation:false,listRoot:()=>items,presentation:{layout:[{kind:'source',eventId:'static:1'}],contentAlignment:'top',animation:{}},hostOptions:{managed:false,direction:'bottom'},runtime:{config:{danmakuAtBottom:true}},renderer:{messages:[{id:'static:1'}]},applyEventTransition(){},fallbackSignature:'',post(){},document:{createDocumentFragment(){return{nodes:[],appendChild(node){this.nodes.push(node);}};}}};
 vm.createContext(context);vm.runInContext(body+';syncPresentation();syncPresentation();',context);assert.equal(moves,0);assert.deepEqual(items.children,[row]);
});
