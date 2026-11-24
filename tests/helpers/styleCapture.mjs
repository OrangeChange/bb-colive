export async function waitForStyleCapture(page, timeout = 20000) {
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  const states=await Promise.all(page.frames().map(frame=>frame.evaluate(()=>{
   const active=document.getAnimations().some(animation=>{
    const timing=animation.effect?.getComputedTiming();
    const frames=animation.effect?.getKeyframes()??[];
    const first=frames[0],last=frames.at(-1);
    const entering=first?.opacity!==undefined&&last?.opacity!==undefined&&Number(first.opacity)<Number(last.opacity);
    return entering&&timing&&Number.isFinite(timing.endTime)&&animation.playState==='running';
   });
   const pending=[...document.images].some(image=>{
    const rect=image.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&!image.complete;
   });
   return !active&&!pending&&document.fonts.status!=='loading';
  }).catch(()=>false)));
  if(states.every(Boolean))return;
  await page.waitForTimeout(50);
 }
 throw new Error('字体、可见图片或入场动画尚未稳定，未生成外观验收截图');
}
export async function captureSettledStyle(page,path){
 await waitForStyleCapture(page);
 await page.screenshot({path,omitBackground:true});
}
export async function mountMediaAcceptanceProbe(frame,css){
 await frame.evaluate(css=>{
  const node=document.createElement('div');node.className='media-acceptance-probe';
  node.style.cssText='position:fixed;right:0;bottom:0;width:100px;height:100px;z-index:2147483647';
  const style=document.createElement('style');style.textContent=css;
  document.body.append(style,node);
 },css);
}
