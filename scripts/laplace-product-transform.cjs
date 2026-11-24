/* Bounded reviewed predicates and existing identity element expressions only. */
const acorn = require('../vendor/laplace/tools/acorn');
function walk(node, visit, root = node) {
 if (!node || typeof node !== 'object') return;
 if (node !== root && ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) return;
 visit(node);
 for (const [key, value] of Object.entries(node)) {
  if (['start','end','loc'].includes(key)) continue;
  if (Array.isArray(value)) value.forEach(child => walk(child, visit, root));
  else if (value && typeof value === 'object') walk(value, visit, root);
 }
}
function transformProductRenderer(source) {
 const ast = acorn.parse(source, {ecmaVersion:'latest',sourceType:'module'}), anchors=[];
 const specs = [
  {fn:'mu',old:'v>f',replacement:'productGiftHighlight(e,v,f)',binding:'x',proof:['showGiftHighlightAbove:f','v=e?.blindGift?e.blindGift.gift_tip_price*e.giftAmount/1e3:e.priceNormalized']},
  {fn:'ku',old:'u>a',replacement:'productHighlight(u,a)',binding:'p',proof:['showGiftHighlightAbove:a','u=e.priceNormalized']},
  {fn:'uu',old:'u&&e.currentRank&&e.currentRank>0',replacement:'productCurrentRankVisible(u,e.currentRank)',proof:['showCurrentRank:u']},
  {fn:'uu',old:'t===`dashboard`||h!==!1',replacement:'h!==!1',binding:'S',proof:['showSpoiler:h']},
  {fn:'Vu',old:'t===`dashboard`||c!==!1',replacement:'c!==!1',binding:'g',proof:['showSpoiler:c']},
 ];
 for(const spec of specs) {
  const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name===spec.fn);
  if(functions.length!==1) throw Error(`Product anchor function ${spec.fn}: expected one`);
  const fn=functions[0], declarations=fn.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations);
  if(fn.params[0]?.type!=='ObjectPattern'||!fn.params[0].properties.some(p=>p.type==='Property'&&!p.computed&&p.key.name==='data'&&p.value.type==='Identifier'&&p.value.name==='e'))throw Error(`Product binding ${spec.fn}: data parameter`);
  for(const proof of spec.proof) {
   const equals=proof.indexOf('=');
   let matches;
   if(equals!==-1) {
    const name=proof.slice(0,equals),initializer=proof.slice(equals+1);
    matches=declarations.filter(n=>n.id.type==='Identifier'&&n.id.name===name&&n.init&&source.slice(n.init.start,n.init.end)===initializer);
   } else {
    const [name,local]=proof.split(':');
    matches=declarations.filter(n=>n.id.type==='ObjectPattern'&&n.id.properties.some(p=>p.type==='Property'&&!p.computed&&p.key.name===name&&p.value.type==='Identifier'&&p.value.name===local)
      && n.init && (spec.fn==='mu' ? n.init.type==='Identifier'&&n.init.name==='o' : source.slice(n.init.start,n.init.end)==='tt()'));
    if(spec.fn==='mu'&&!declarations.some(n=>n.id.type==='Identifier'&&n.id.name==='o'&&source.slice(n.init.start,n.init.end)==='tt()')) throw Error('Product binding mu: settings origin');
   }
   if(matches.length!==1)throw Error(`Product binding ${spec.fn}: ${proof}`);
  }
  const hits=[];walk(fn,n=>{if(source.slice(n.start,n.end)===spec.old)hits.push(n)});
  if(hits.length!==1) throw Error(`Product anchor ${spec.fn}/${spec.old}: expected one, got ${hits.length}`);
  const hit=hits[0];let bound=false;
  if(spec.binding) bound=declarations.some(n=>n.id.type==='Identifier'&&n.id.name===spec.binding&&n.init===hit);
  else for(const statement of fn.body.body.filter(n=>n.type==='ReturnStatement'))walk(statement.argument,n=>{if(n.type==='ConditionalExpression'&&n.test===hit)bound=true});
  if(!bound)throw Error(`Product binding ${spec.fn}: target context changed`);
  anchors.push({function:spec.fn,start:hit.start,end:hit.end,original:spec.old,replacement:spec.replacement});
 }
 const elementSpecs=require('./laplace-product-element-anchors.json');
 for(const name of [...new Set(elementSpecs.map(a=>a.function))]) {
  const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  if(functions.length!==1)throw Error(`Product element anchor function ${name}`);
  const fn=functions[0];
  // Frozen enclosing source proves all conditions and lexical bindings, not only leaf text.
  const digest=require('node:crypto').createHash('sha256').update(source.slice(fn.start,fn.end)).digest('hex');
  if(elementSpecs.filter(a=>a.function===name).some(a=>a.functionSha256!==digest))throw Error(`Product element anchor provenance ${name}: enclosing function changed`);
  if(!fn.params[0]?.properties?.some(p=>p.key?.name==='mode'&&p.value?.name==='t'))throw Error(`Product element binding ${name}: mode`);
  const found=[];
  function elements(node,parent,depth=0) {
   if(!node||typeof node!=='object')return;
   if(node!==fn&&['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
    // Only the two authored winner-list map callbacks per result function.
    if(!['Su','Ou'].includes(name)||depth!==0||node.type!=='ArrowFunctionExpression'||parent?.type!=='CallExpression'||parent.callee?.property?.name!=='map'||parent.callee.object?.name!=='u'||node.params.length!==1||node.params[0].name!=='n')return;
    depth++;
   }
   if(node.type==='CallExpression') {
    const callee=node.callee;
    const jsx=callee.type==='SequenceExpression'&&callee.expressions.length===2&&callee.expressions[0].value===0&&callee.expressions[1].object?.name==='U'&&['jsx','jsxs'].includes(callee.expressions[1].property?.name);
    const cls=node.arguments[1]?.properties?.find(p=>p.key?.name==='className')?.value;
    const nameClass=cls?.type==='TemplateLiteral'&&cls.expressions.length===0&&['username','reply-username','gift-receiver-username'].includes(cls.quasis[0].value.cooked);
    if(jsx&&(node.arguments[0]?.name==='Z'||nameClass))found.push({node,depth,kind:node.arguments[0]?.name==='Z'?'avatar':'username',original:source.slice(node.start,node.end)});
   }
   for(const[key,value]of Object.entries(node)) {
    if(['start','end','loc'].includes(key))continue;
    if(Array.isArray(value))value.forEach(child=>elements(child,node,depth));
    else if(value&&typeof value==='object')elements(value,node,depth);
   }
  }
  elements(fn,null);
  const expected=elementSpecs.filter(a=>a.function===name);
  if(found.length!==expected.length||found.some((a,i)=>a.kind!==expected[i].kind||a.depth!==expected[i].depth||a.original!==expected[i].original))throw Error(`Product element anchor ${name}: original expressions/count/nesting changed`);
  for(const hit of found) anchors.push({function:name,kind:hit.kind,start:hit.node.start,end:hit.node.end,original:hit.original,modeBypass:'mode !== obs',replacement:`(0,U.jsx)(${hit.kind==='avatar'?'ProductAvatar':'ProductUsername'},{mode:t,children:${hit.original}})`});
 }
 const ordered=[...anchors].sort((a,b)=>a.start-b.start);
 if(ordered.some((a,i)=>i&&a.start<ordered[i-1].end))throw Error('Product anchor overlap');
 let code=source;
 for(const anchor of [...anchors].sort((a,b)=>b.start-a.start))code=code.slice(0,anchor.start)+anchor.replacement+code.slice(anchor.end);
 const old="export { LaplaceRenderContext, defaultOptions } from '../../../src/compat/laplace/renderer/runtime-context.mjs';";
 if(code.split(old).length!==2)throw Error('Product default export anchor missing/duplicate');
 code=code.replace(old,"export { LaplaceRenderContext } from '../../../src/compat/laplace/renderer/runtime-context.mjs';\nimport { defaultOptions as sourceDefaultOptions } from '../../../src/compat/laplace/renderer/runtime-context.mjs';\nexport const defaultOptions = Object.freeze({...sourceDefaultOptions,showCurrentRank:false,showGiftHighlightAbove:30,classicElementScope:false});\nexport const supportsProductElements = true;\nfunction ProductAvatar({mode,children}){const options=tt();return mode!=='obs'||options.classicElementScope===true||options.showAvatar!==false?children:null;}\nfunction ProductUsername({mode,children}){const options=tt();return mode!=='obs'||options.classicElementScope===true||options.showUsername!==false?children:null;}\nimport { productGiftHighlight, productHighlight, productCurrentRankVisible } from '../../../src/compat/laplace/productPresentationPolicy.ts';");
 return {code,anchors};
}
module.exports={transformProductRenderer};
