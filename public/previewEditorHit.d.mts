export interface PreviewPoint {x:number;y:number}
export interface PreviewEditorPick {part:string;node:Element;distance:number;specificity:number;priority:number;box:DOMRect}
export function pickPreviewEditorPart(target:Element,selectors:Record<string,readonly string[]>|undefined,point?:PreviewPoint,accepts?:(part:string,node:Element)=>boolean):PreviewEditorPick|null;
export function installPreviewEditorHover(root:Document|Element,pick:(event:PointerEvent)=>{node:Element}|null):()=>void;

export function previewEditorAccent(doc:Document,scheme:"light"|"dark"):string;
