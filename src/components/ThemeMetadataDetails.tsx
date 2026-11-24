import {formatThemeDate} from "../themes/themeDate.ts";
import {useEffect,useState} from 'react';
import type {ThemeDocument} from '../themes/themeTypes.ts';
export function ThemeMetadataDetails({document,themeId,load}:{document?:ThemeDocument;themeId?:string;load(id:string):Promise<ThemeDocument>}) {
 const [stored,setStored]=useState<ThemeDocument>();
 useEffect(()=>{let active=true;setStored(undefined);if(themeId)void load(themeId).then(d=>{if(active)setStored(d)}).catch(()=>{});return()=>{active=false}},[themeId,load]);
 const metadata=(document??stored)?.metadata;
 return <dl className="theme-metadata-details">{([['来源网址',metadata?.sourceUrl],['作者更新时间',metadata?.updatedAt],['导入时间',metadata?.importedAt],['本地修改时间',metadata?.localModifiedAt]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd title={value}>{label==='来源网址' ? value||'未标注' : formatThemeDate(value)}</dd></div>)}</dl>;
}
