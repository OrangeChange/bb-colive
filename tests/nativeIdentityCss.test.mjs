import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNativeIdentityCss } from '../src/themes/nativeIdentityCss.ts';

test('按身份优先级编排运行规则，选择器及原文保持原意',()=>{
 const source='/* 舰长 */\n.guard-level-3 { --bg: green; }\n/* 房管 */\n.mod { --bg: blue; }';
 const priority=['admin','captain','anchor','viceroy','admiral','normal'];
 const css=resolveNativeIdentityCss(source,priority);
 assert.ok(css.indexOf('.guard-level-3')<css.indexOf('.mod'));
 assert.doesNotMatch(css,/data-event-role|:where/);
 const reverse=resolveNativeIdentityCss(source,['captain','admin','anchor','viceroy','admiral','normal']);
 assert.ok(reverse.indexOf('.mod')<reverse.indexOf('.guard-level-3'));
 assert.equal(source,'/* 舰长 */\n.guard-level-3 { --bg: green; }\n/* 房管 */\n.mod { --bg: blue; }');
 assert.equal(resolveNativeIdentityCss(css,priority),css);
});

test('徽章后代、购买等级及显式多身份条件不参与编排',()=>{
 const source='.guard-level-3 .guard-badge {height:20px}.guard-purchase-level-3{color:red}.guard-level-3.mod{color:blue}';
 assert.equal(resolveNativeIdentityCss(source),source);
});

test('条件范围内独立排序，并保持对应注释',()=>{
 const source='@media(min-width:1px){/* 房管 */.dark .type-chat.mod::before{color:red}/* 舰长 */.dark .type-chat.guard-level-3::before{color:blue}}';
 const css=resolveNativeIdentityCss(source,['admin','captain']);
 assert.ok(css.indexOf('舰长')<css.indexOf('房管'));
 assert.match(css,/\.dark \.type-chat\.mod::before/);
 assert.doesNotMatch(css,/data-event-role/);
});
