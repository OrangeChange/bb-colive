const revisions=new WeakMap<HTMLElement,{revision:object;nodes:Set<HTMLElement>}>();

export const LAPLACE_ENTRY_MOTION_CSS=`@layer config {
  :where(.event-list [data-laplace-entry-motion]) {
    animation-duration: var(--laplace-entry-durations);
    animation-delay: var(--laplace-entry-delays);
  }
}`;

function restoreEntryMotion(node:HTMLElement){
  node.removeAttribute('data-laplace-entry-motion');
  node.style.removeProperty('--laplace-entry-durations');
  node.style.removeProperty('--laplace-entry-delays');
}

/** Active host entry motion replaces theme entry timing without affecting decoration. */
export function reconcileLaplaceEntryMotion(root:HTMLElement,revision:object,hostMotionEnabled=true){
  let state=revisions.get(root);
  if(!hostMotionEnabled){
    for(const node of state?.nodes??[])restoreEntryMotion(node);
    revisions.delete(root);
    return;
  }
  if(state?.revision!==revision){
    for(const node of state?.nodes??[])restoreEntryMotion(node);
    state={revision,nodes:new Set()};
    revisions.set(root,state);
  }
  for(const node of state.nodes)if(!root.contains(node))state.nodes.delete(node);
  const entries=new Map<HTMLElement,Set<string>>();
  for(const animation of root.getAnimations({subtree:true})){
    const effect=animation.effect;
    if(!(animation instanceof CSSAnimation)||!(effect instanceof KeyframeEffect)||effect.pseudoElement||!(effect.target instanceof HTMLElement))continue;
    const node=effect.target;
    if(state.nodes.has(node)||!node.closest('.event-list')||effect.getTiming().iterations===Infinity)continue;
    const frames=effect.getKeyframes();
    const end=frames[frames.length-1];
    if(end&&(end.opacity!==undefined&&Number(end.opacity)<=0||end.visibility==='hidden'||end.visibility==='collapse'||end.display==='none'))continue;
    let names=entries.get(node);
    if(!names){names=new Set();entries.set(node,names);}
    names.add(animation.animationName);
  }
  for(const [node,entryNames] of entries){
    const style=getComputedStyle(node);
    const names=style.animationName.split(',');
    if(names.every(name=>name.trim()==='none'))continue;
    const iterations=style.animationIterationCount.split(',');
    const durations=style.animationDuration.split(',');
    const delays=style.animationDelay.split(',');
    const finite=names.map((name,index)=>entryNames.has(name.trim())&&iterations[index%iterations.length].trim()!=='infinite');
    if(!finite.some(Boolean))continue;
    node.style.setProperty('--laplace-entry-durations',finite.map((finish,index)=>finish?'0s':durations[index%durations.length]).join(','));
    node.style.setProperty('--laplace-entry-delays',finite.map((finish,index)=>finish?'0s':delays[index%delays.length]).join(','));
    node.setAttribute('data-laplace-entry-motion','');
    state.nodes.add(node);
  }
}
