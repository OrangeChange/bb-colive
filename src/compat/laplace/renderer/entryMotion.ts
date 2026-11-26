/** Theme entry motion takes precedence over the software entry transition. */
export function hasLaplaceThemeEntryMotion(row:HTMLElement):boolean{
 return row.getAnimations({subtree:true}).some(animation=>{
  const effect=animation.effect;
  if(!(animation instanceof CSSAnimation)||!(effect instanceof KeyframeEffect)||effect.pseudoElement||effect.getTiming().iterations===Infinity||Number(effect.getTiming().duration)<=0)return false;
  const frames=effect.getKeyframes(),end=frames[frames.length-1];
  if(end&&(end.opacity!==undefined&&Number(end.opacity)<=0||end.visibility==='hidden'||end.visibility==='collapse'||end.display==='none'))return false;
  return true;
 });
}
