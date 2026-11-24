import { contrastRatio, normalizeCustomColor } from './customPalette.ts';
import { rgbaToHsla, hslaToRgba, rgbaToHex } from './eventStyleSettings.ts';
import { parseThemeColor } from './components/themeColorValue.ts';

export type CoLiveState = 'live' | 'rest' | 'idle' | 'connecting' | 'error';

export function resolveCoLiveState(status: string, liveStatus?: number): CoLiveState {
  if (status === 'error') return 'error';
  if (status === 'idle' || status === 'closed') return 'idle';
  if (status !== 'connected' || liveStatus === undefined) return 'connecting';
  return liveStatus === 0 ? 'rest' : 'live';
}

export function resolveCoLiveColors(themeColor: string, scheme: 'light' | 'dark') {
  const color = normalizeCustomColor(themeColor);
  const character = scheme === 'light' ? '#ffffff' : color;
  const frame = scheme === 'light' ? color : '#ffffff';
  let face = frame;
  // 只降低五官墨色的亮度，电视外框与用户主色保持原值。
  if (contrastRatio(color, '#ffffff') < 2 && contrastRatio(face, character) < 3.2) {
    const seed = rgbaToHsla(parseThemeColor(color)!);
    for (let step = 1; step <= 1000; step++) {
      face = rgbaToHex(hslaToRgba({ ...seed, l: Math.max(0, seed.l - step / 10) })).toLowerCase();
      if (contrastRatio(face, character) >= 3.2) break;
    }
  }
  return { frame, character, face };
}
