import type { RgbaColor } from '../eventStyleSettings.ts';
import type { WindowAppearanceSettings } from '../windowAppearance.ts';

export async function applyEventWindowMaterial(
  applyNative: (material: WindowAppearanceSettings['material'], radius: number, scheme: 'light' | 'dark', glassTint: number, surfaceColor: RgbaColor | null) => Promise<void>,
  material: WindowAppearanceSettings['material'], radius: number, scheme: 'light' | 'dark',
  glassTint = 0.18, surfaceColor: RgbaColor | null = null,
): Promise<{ backgroundBlur: 'active' | 'off' | 'failed' }> {
  try {
    await applyNative(material, radius, scheme, glassTint, surfaceColor);
    return { backgroundBlur: material === 'glass' ? 'active' : 'off' };
  } catch {
    return { backgroundBlur: 'failed' };
  }
}
