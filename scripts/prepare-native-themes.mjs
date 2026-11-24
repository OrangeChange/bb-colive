import {readFile,writeFile} from 'node:fs/promises';
const defaultTheme=(await readFile(new URL('../src/themes/nativeDefaultTheme.css',import.meta.url),'utf8')).replaceAll('\r\n','\n');
await writeFile(new URL('../src/themes/nativeDefaultThemeSource.generated.ts',import.meta.url),`export const NATIVE_DEFAULT_THEME_CSS = ${JSON.stringify(defaultTheme)};\n`);
const source=(await readFile(new URL('../src/themes/nativeCardTheme.css',import.meta.url),'utf8')).replaceAll('\r\n','\n');
await writeFile(new URL('../src/themes/nativeCardThemeSource.generated.ts',import.meta.url),`export const NATIVE_CARD_THEME_CSS = ${JSON.stringify(source)};\n`);
const bubble=(await readFile(new URL('../src/themes/nativeBubbleTheme.css',import.meta.url),'utf8')).replaceAll('\r\n','\n');
await writeFile(new URL('../src/themes/nativeBubbleThemeSource.generated.ts',import.meta.url),`export const NATIVE_BUBBLE_THEME_CSS = ${JSON.stringify(bubble)};\n`);

const {scopeThemeCss}=await import("../src/themes/themeCssScope.ts");
const foundation=(await readFile(new URL("../src/eventStyle.css",import.meta.url),"utf8")).replaceAll("\r\n","\n");
await writeFile(new URL("../src/themes/nativeDefaultStyle.generated.css",import.meta.url),scopeThemeCss(foundation,".theme-surface"));
