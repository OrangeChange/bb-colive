/** BB internal iframe bridge; deliberately not the upstream BLC SDK. */
export const OPENLIVE_CHANNEL='bb-openlive';
export const COMMANDS=new Set(['preview-present','preview-observe','preview-window','event-batch','event','config','css','reset','simulation','simulation-begin','simulation-next','hydrate','snapshot','inspect','host','presentation','locate','scroll-latest','restore-scroll','editor-select']);
export function acceptsParentMessage(event,parentWindow,parentOrigin){
  return event?.source===parentWindow && event.origin===parentOrigin && event.data?.type===OPENLIVE_CHANNEL && COMMANDS.has(event.data.command);
}

export function skinStylesheet(skin){return skin==='default'?'./named-default.css':null;}
export function previewDelay(config,random=Math.random){const min=config.minDanmakuInterval,max=Math.max(min,config.maxDanmakuInterval);return min+random()*(max-min);}
