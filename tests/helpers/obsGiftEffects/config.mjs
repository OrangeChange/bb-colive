import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const defaults = path.join(root, '.superpowers/sdd/2026-11-01-style-common-behavior');
const assetDirectory = process.env.OBS_EFFECT_ASSET_DIR ? path.resolve(process.env.OBS_EFFECT_ASSET_DIR) : defaults;
const evidenceDirectory = path.join(defaults, 'evidence');
await fs.mkdir(evidenceDirectory, { recursive: true });

export const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const effectAsset = name => path.join(assetDirectory, name);
export const evidenceFile = name => path.join(evidenceDirectory, name);
export const imageFixture = path.join(root, 'public/media/style-preview-avatar-1.jpg');
