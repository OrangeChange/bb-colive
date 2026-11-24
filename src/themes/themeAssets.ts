import {isImageBackgroundDraft} from "../components/themeImageValue.ts";
import valueParser, {type Node as ValueNode} from "postcss-value-parser";
import safeParse from "postcss-safe-parser";
import type { ThemeDocument } from "./themeTypes.ts";

export interface ThemeAssetInput {
  id: string;
  name: string;
  fileName: string;
  mediaType: string;
}

function portableFileName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? "asset";
  return leaf.replace(/[^a-zA-Z0-9._-]/g, "-") || "asset";
}

export function addThemeAsset(document: ThemeDocument, input: ThemeAssetInput): ThemeDocument {
  const fileName = portableFileName(input.fileName);
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  const occupied = new Set(document.assets.filter(asset => asset.id !== input.id).map(asset => asset.path.toLowerCase()));
  let path = `assets/${fileName}`;
  for (let suffix = 2; occupied.has(path.toLowerCase()); suffix += 1) path = `assets/${stem}-${suffix}${extension}`;
  const reference = { id: input.id, name: input.name, path, mediaType: input.mediaType };
  return { ...document, assets: [...document.assets.filter(asset => asset.id !== input.id), reference] };
}

export function removeThemeAsset(document: ThemeDocument, assetId: string): ThemeDocument {
  return { ...document, assets: document.assets.filter(asset => asset.id !== assetId) };
}

export function resolveThemeAssetUrl(bytes: Uint8Array, mediaType: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
}

export async function readThemeAssetDraft(
  path: string,
  changes: Record<string, Uint8Array | null>,
  readSaved: (path: string) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (Object.prototype.hasOwnProperty.call(changes, path)) {
    const value = changes[path];
    if (value === null) throw new Error(`资源已从草稿移除：${path}`);
    return value;
  }
  return readSaved(path);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function resolveThemeAssetUrls(document: ThemeDocument, read: (path: string) => Promise<Uint8Array>): Promise<Map<string, string>> {
  const replacements = await Promise.all(document.assets.map(async asset => [asset.path, `data:${asset.mediaType};base64,${base64(await read(asset.path))}`] as const));
  return new Map(replacements);
}

export function applyThemeAssetUrls(document: ThemeDocument, urls: ReadonlyMap<string, string>): ThemeDocument {
  const replace = (css: string): string => {
    const root = safeParse(css);
    root.walkAtRules("import", rule => {
      const parsed = valueParser(rule.params);
      const first = parsed.nodes.find(node => node.type !== "space" && node.type !== "comment");
      if (first?.type === "string") first.value = urls.get(first.value.replace(/^\.\//, "")) ?? first.value;
      else if (first?.type === "function" && first.value.toLowerCase() === "url") {
        const raw = valueParser.stringify(first.nodes).trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
        const replacement = urls.get(raw.replace(/^\.\//, ""));
        if (replacement) first.nodes = [{type:"string",quote:'"',value:replacement,sourceIndex:0,sourceEndIndex:0}];
      }
      rule.params = parsed.toString();
    });
    root.walkDecls(declaration => {
      const parsed = valueParser(declaration.value);
      const resolve = (raw:string) => {
        const value=raw.replace(/^\.\//, ""), hash=value.indexOf("#");
        const path=hash<0?value:value.slice(0,hash), fragment=hash<0?"":value.slice(hash);
        return urls.has(path) ? urls.get(path)!+fragment : raw;
      };
      const visit=(nodes:ValueNode[],imageSet=false)=>{for(const node of nodes){
        if(node.type === "function" && node.value.toLowerCase() === "url"){
          const raw=valueParser.stringify(node.nodes).trim().replace(/^(["'])([\s\S]*)\1$/,"$2");
          if(resolve(raw)!==raw) node.nodes=[{type:"string",quote:'"',value:resolve(raw),sourceIndex:0,sourceEndIndex:0}];
        }else if(node.type === "function")visit(node.nodes,/^(?:-webkit-)?image-set$/i.test(node.value));
        else if(imageSet && node.type === "string") node.value=resolve(node.value);
      }};
      visit(parsed.nodes);declaration.value=parsed.toString();
    });
    return root.toString();
  };
  const settings=structuredClone(document.settings);
  const visual=settings.visualModel as Record<string,Record<string,Record<string,{value?:unknown}>>>|undefined;
  for(const layer of Object.values(visual??{}))for(const properties of Object.values(layer))for(const property of ['background','borderImage']){
    const setting=properties[property];
    if(isImageBackgroundDraft(setting?.value))for(const layer of setting.value.layers){const root=safeParse(replace(`:root { --theme-image: ${layer.image}; }`));root.walkDecls('--theme-image',declaration=>{layer.image=declaration.value;});}
    if(typeof setting?.value==='string'){
      const root=safeParse(replace(`:root { --theme-image: ${setting.value}; }`));
      root.walkDecls('--theme-image',declaration=>{setting.value=declaration.value;});
    }
  }
  const decorations=settings.imageDecorations as Record<string,{source:string}[]>|undefined;
  for(const images of Object.values(decorations??{}))for(const image of images)image.source=urls.get(image.source.replace(/^\.\//,''))??image.source;
  return { ...document, settings, styles: { baseCss: replace(document.styles.baseCss), visualCss: replace(document.styles.visualCss), customCss: replace(document.styles.customCss) } };
}

export async function inlineThemeAssetUrls(document: ThemeDocument, read: (path: string) => Promise<Uint8Array>): Promise<ThemeDocument> {
  return applyThemeAssetUrls(document, await resolveThemeAssetUrls(document, read));
}
