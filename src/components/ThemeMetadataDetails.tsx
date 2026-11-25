import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import {formatThemeDate} from "../themes/themeDate.ts";
import {useEffect,useState} from 'react';
import type {ThemeDocument} from '../themes/themeTypes.ts';
export function ThemeMetadataDetails({document,themeId,load}:{document?:ThemeDocument;themeId?:string;load(id:string):Promise<ThemeDocument>}) {
  useUiLanguage();
 const [stored,setStored]=useState<ThemeDocument>();
 useEffect(()=>{let active=true;setStored(undefined);if(themeId)void load(themeId).then(d=>{if(active)setStored(d)}).catch(()=>{});return()=>{active=false}},[themeId,load]);
 const metadata=(document??stored)?.metadata;
 return <dl className="theme-metadata-details">{([['source',uiText("themeMetadataDetails.sourceUrl"),metadata?.sourceUrl],["updated",uiText("themeMetadataDetails.ThemeMetadataDetails"),metadata?.updatedAt],["imported",uiText("themeMetadataDetails.ThemeMetadataDetails2"),metadata?.importedAt],["modified",uiText("themeMetadataDetails.ThemeMetadataDetails3"),metadata?.localModifiedAt]] as const).map(([id,label,value])=><div key={id}><dt>{label}</dt><dd title={value}>{id==='source' ? value||uiText("themeMetadataDetails.ThemeMetadataDetails4") : formatThemeDate(value)}</dd></div>)}</dl>;
}
