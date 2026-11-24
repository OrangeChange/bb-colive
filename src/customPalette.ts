import { parseThemeColor } from './components/themeColorValue.ts';

type RGB = [number, number, number];
export const DEFAULT_CUSTOM_COLOR = '#e04e7e';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const linear = (n: number) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
const gamma = (n: number) => n <= .0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - .055;
const rgb = (value: RGB) => `rgb(${value.map(n => Math.round(clamp(n) * 255)).join(', ')})`;
function channels(value: string): RGB {
  const c = parseThemeColor(value) ?? parseThemeColor(DEFAULT_CUSTOM_COLOR)!;
  return [c.r / 255, c.g / 255, c.b / 255];
}
export function normalizeCustomColor(value: string): string {
  return '#' + channels(value).map(n => Math.round(clamp(n)*255).toString(16).padStart(2,'0')).join('');
}
export function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) => channels(color).map(linear).reduce((sum, c, i) => sum + c * [.2126,.7152,.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}
function toOklch(color: string): [number, number, number] {
  const [r,g,b] = channels(color).map(linear);
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
  const bb = .0259040371*l + .7827717662*m - .808675766*s;
  return [.2104542553*l + .793617785*m - .0040720468*s, Math.hypot(a,bb), Math.atan2(bb,a)];
}
function fromOklch(light: number, chroma: number, hue: number): string {
  const convert = (c: number): RGB => {
    const a = c * Math.cos(hue), b = c * Math.sin(hue);
    const l = (light + .3963377774*a + .2158037573*b) ** 3;
    const m = (light - .1055613458*a - .0638541728*b) ** 3;
    const s = (light - .0894841775*a - 1.291485548*b) ** 3;
    return [4.0767416621*l - 3.3077115913*m + .2309699292*s, -1.2684380046*l + 2.6097574011*m - .3413193965*s, -.0041960863*l - .7034186147*m + 1.707614701*s];
  };
  let result = convert(chroma);
  if (result.some(n => n < 0 || n > 1)) {
    let low = 0, high = chroma;
    for(let i=0;i<16;i++) { const mid = (low+high)/2; if(convert(mid).some(n=>n<0||n>1))high=mid;else low=mid; }
    result = convert(low);
  }
  return rgb(result.map(gamma) as RGB);
}
export function generateCustomPalette(seed: string, scheme: 'light' | 'dark'): Record<string,string> {
  const [seedL, seedC, hue] = toOklch(seed), dark = scheme === 'dark';
  const neutral = (l: number) => fromOklch(l, Math.min(seedC*.08,.012),hue);
  const c = Math.min(seedC,.18);
  const surface = neutral(dark ? .2 : 1);
  const accentL = seedL;
  const accent = normalizeCustomColor(seed);
  const state = (delta: number) => fromOklch(clamp(accentL + delta), c, hue);
  const alpha=(value:string,opacity:number)=>`rgba(${channels(value).map(channel=>Math.round(channel*255)).join(', ')}, ${opacity})`;
  const solidChroma = seedC < .01 ? seedC : Math.min(.18, Math.max(seedC, .105));
  let solidL = Math.min(seedL, .57);
  let solid = fromOklch(solidL, solidChroma, hue);
  while (contrastRatio('#ffffff', solid) < 4.5 && solidL > 0) {
    solidL = Math.max(0, solidL - .001);
    solid = fromOklch(solidL, solidChroma, hue);
  }
  const solidState = (factor: number) => rgb(channels(solid).map(value => value * factor) as RGB);
  const backgrounds = [neutral(dark ? .16:.982), surface, neutral(dark ? .24:.964)];
  const tinted = backgrounds.map(background => rgb(channels(background).map((value, i) => value * .85 + channels(accent)[i] * .15) as RGB));
  let textL = dark ? Math.max(.65, accentL) : Math.min(.58, accentL);
  let accentText = fromOklch(textL, solidChroma, hue);
  while ([...backgrounds, ...tinted].some(background => contrastRatio(accentText, background) < 4.5) && textL > 0 && textL < 1) {
    textL = clamp(textL + (dark ? .01 : -.01));
    accentText = fromOklch(textL, solidChroma, hue);
  }
  return {
    '--bg':neutral(dark ? .16:.982),'--surface':surface,'--surface-raised':neutral(dark ? .24:.964),
    '--text-1':neutral(dark ? .94:.2),'--text-2':neutral(dark ? .74:.42),'--text-3':neutral(dark ? .68:.48),
    '--border':alpha(neutral(dark ? .94:.2),dark ? .07:.09),
    '--accent':accent,'--accent-hover':state(dark ? .045:-.04),'--accent-active':state(-.08),
    '--accent-subtle':alpha(accent,dark ? .14:.1),'--accent-ring':alpha(accentText,.4),'--accent-fg':'#ffffff','--accent-text':accentText,
    '--accent-solid':solid,'--accent-solid-hover':solidState(.92),'--accent-solid-active':solidState(.84),
  };
}
export function applyCustomPalette(doc: Document, color: string): void {
  const normalized = normalizeCustomColor(color);
  doc.documentElement.dataset.customColor = normalized;
  let style = doc.getElementById('danmu-custom-palette');
  if (!style) { style=doc.createElement('style');style.id='danmu-custom-palette';doc.head.append(style); }
  const palettes = {light:generateCustomPalette(normalized,'light'),dark:generateCustomPalette(normalized,'dark')};
  const surfaces = {'--surface-light':palettes.light['--surface'],'--surface-dark':palettes.dark['--surface']};
  const css = (['light','dark'] as const).map(scheme=>`:root[data-theme="custom"]${scheme==='dark'?'.dark':''}{${Object.entries({...palettes[scheme],...surfaces}).map(([name,value])=>`${name}:${value};`).join('')}}`).join('\n');
  if(style.textContent!==css)style.textContent=css;
}
