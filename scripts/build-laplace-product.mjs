import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], bundle: true, format: 'iife', platform: 'browser', target: ['chrome111'], outfile: 'public/laplace/product/renderer.js', minify: false, legalComments: 'linked', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile('src/compat/laplace/source.css', 'utf8');
await writeFile('public/laplace/product/default.css', css);
