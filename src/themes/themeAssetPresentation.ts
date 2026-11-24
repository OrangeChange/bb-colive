import { uiText } from "../i18n/index.ts";
import valueParser from "postcss-value-parser";
import postcss from "postcss";
import type { ThemeAssetReference, ThemeStyles } from "./themeTypes.ts";

type PresentedAsset = ThemeAssetReference & { sharedResourceId?: string; cacheResourceId?: string };

export function isLocalUserThemeAsset(asset: PresentedAsset): boolean {
  return !asset.id.startsWith("assets/catalog-") && !asset.id.startsWith("catalog-")
    && !asset.sharedResourceId && !asset.cacheResourceId
    && /^assets\//.test(asset.path) && !asset.path.includes("://");
}

function cssString(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, "\\a ") + '"';
}

export function themeAssetReference(asset: ThemeAssetReference): string {
  return `url(${cssString(asset.path)})`;
}

export function themeAssetInsertValue(asset:ThemeAssetReference,alias?:string):string {
 return asset.mediaType.startsWith("image/")?themeAssetReference(asset):cssString(alias?.trim()||themeAssetFontAlias(asset));
}

export function themeAssetFontAlias(asset: ThemeAssetReference): string {
  return (asset.name.split(/[\\/]/).pop() ?? asset.name).replace(/\.[^.]+$/, "") || "主题字体";
}

export function themeAssetExample(asset: ThemeAssetReference, alias = themeAssetFontAlias(asset)): string {
  return asset.mediaType.startsWith("image/")
    ? `background-image: ${themeAssetReference(asset)};`
    : `@font-face {\n  font-family: ${cssString(alias.trim() || themeAssetFontAlias(asset))};\n  src: ${themeAssetReference(asset)};\n}\n\n/* 将 .example 换成需要应用字体的选择器 */\n.example {\n  font-family: ${cssString(alias.trim() || themeAssetFontAlias(asset))};\n}`;
}

export interface ThemeAssetUsage { layer: keyof ThemeStyles; line: number; context: string }

export function findThemeAssetUsages(styles: ThemeStyles, asset: ThemeAssetReference): ThemeAssetUsage[] {
  const usages: ThemeAssetUsage[] = [];
  for (const layer of ["baseCss", "visualCss", "customCss"] as const) {
    const css = styles[layer];
    const inspect = (value: string, offset: number, context: string) => {
      const parsed=valueParser(value);
      parsed.walk(node=>{
        let raw:string|undefined;
        if(node.type==='function' && node.value.toLowerCase()==='url')raw=valueParser.stringify(node.nodes).trim().replace(/^(["'])([\s\S]*)\1$/,'$2');
        if(node.type==='string'){
          const parent=value.slice(0,node.sourceIndex);
          if(/(?:-webkit-)?image-set\([^)]*$/i.test(parent))raw=node.value;
        }
        if(raw?.replace(/^\.\//,'').split('#')[0]===asset.path)usages.push({layer,line:css.slice(0,offset+node.sourceIndex).split('\n').length,context});
        if(node.type==='function'&&node.value.toLowerCase()==='url')return false;
      });
    };
    try {
      postcss.parse(css).walkDecls(decl => {
        const start = decl.source?.start?.offset ?? 0;
        const colon = css.indexOf(":", start);
        inspect(decl.value, colon + 1 + (decl.raws.between?.split(":")[1]?.length ?? 0), decl.parent?.type === "rule" ? decl.parent.selector : decl.prop);
      });
    } catch {
      inspect(css, 0, uiText("themeAssetPresentation.findThemeAssetUsages"));
    }
  }
  return usages;
}
