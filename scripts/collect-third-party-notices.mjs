import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const json = file => JSON.parse(read(file));
const supplements = json('licenses/supplemental/index.json');
const entries = [], missing = [];
const licenseName = /^(licen[sc]e|copying|copyright|notice)([-_.]|$)/i;
function notice(directory, id) {
  const files = fs.readdirSync(directory).filter(name => licenseName.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const parts = files.map(name => `${name}\n\n${read(path.join(directory, name))}`);
  for (const item of supplements[id] || []) parts.push(`${item.url}\n\n${read(path.join('licenses/supplemental', item.file))}`);
  if (!parts.length && id.startsWith('@radix-ui/')) parts.push(read('node_modules/@radix-ui/react-context/LICENSE'));
  return parts.join('\n\n────────────────────────────────\n\n');
}
function add(entry) {
  if (!entry.text.trim()) missing.push(entry.id);
  entries.push(entry);
}
const lock = json('package-lock.json');
for (const [relative, pkg] of Object.entries(lock.packages)) {
  if (!relative || pkg.dev || pkg.os && !pkg.os.includes('win32') || pkg.cpu && !pkg.cpu.includes('x64')) continue;
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) { missing.push(relative); continue; }
  const installed = json(path.join(directory, 'package.json'));
  const name = installed.name, version = installed.version, id = `${name}@${version}`;
  if (entries.some(entry => entry.id === id)) continue;
  const repository = installed.repository;
  add({ id, name, version, category: 'JavaScript', license: installed.license || pkg.license || '',
    url: (typeof repository === 'string' ? repository : repository?.url || `https://www.npmjs.com/package/${name}/v/${version}`).replace(/^git\+/, ''),
    text: notice(directory, id) });
}
const cargo = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--locked', '--offline'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }));
const nodes = new Map(cargo.resolve.nodes.map(node => [node.id, node]));
const selected = new Set();
function visit(id) {
  if (selected.has(id)) return;
  selected.add(id);
  for (const dep of nodes.get(id)?.deps || []) if (dep.dep_kinds.some(kind => kind.kind === null)) visit(dep.pkg);
}
visit(cargo.resolve.root);
for (const pkg of cargo.packages) {
  if (!selected.has(pkg.id) || pkg.id === cargo.resolve.root) continue;
  const id = `${pkg.name}@${pkg.version}`;
  let text = notice(path.dirname(pkg.manifest_path), id);
  if (!text && pkg.license_file) text = read(path.resolve(path.dirname(pkg.manifest_path), pkg.license_file));
  add({ id, name: pkg.name, version: pkg.version, category: 'Rust', license: pkg.license || '', url: `https://crates.io/crates/${pkg.name}/${pkg.version}`, text });
}
for (const mode of ['blivechat', 'openlive']) {
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'renderer.js.LICENSE.txt']) {
    const file = `public/${mode}/${name}`;
    if (fs.existsSync(file)) add({ id: `${mode}/${name}`, name: `${mode} · ${name}`, version: '', category: '兼容渲染', license: '原文所列许可证', url: mode === 'openlive' ? 'https://github.com/DoodleBears/blivechat' : 'https://github.com/xfgryujk/blivechat', text: read(file) });
  }
}
for (const name of ['renderer.js.LEGAL.txt', 'ATTRIBUTION.txt']) {
  const file = `public/laplace/product/${name}`;
  add({ id: `laplace/${name}`, name: `LAPLACE 兼容渲染 · ${name}`, version: '', category: '兼容渲染', license: '原文所列许可证', url: 'https://laplace.live/', text: read(file) });
}
for (const [name, file, license, url] of [
  ['MiSans', 'licenses/fonts/MiSans.txt', 'MiSans 字体知识产权许可协议', 'https://hyperos.mi.com/font/download'],
  ['Barlow Condensed', 'licenses/fonts/Barlow-OFL.txt', 'OFL-1.1', 'https://github.com/jpt/barlow'],
  ['仓耳与墨', null, '仓耳字库免费开源字体授权声明', 'https://www.tsanger.cn/'],
]) add({ id: `font/${name}`, name, version: '', category: '字体', license, url, text: file ? read(file) : '北京仓耳文字技术有限公司\n仓耳字库免费开源字体授权声明\n2020年11月11日\n\n授权原件见下方两页。', ...(file ? {} : { images: ['Tsanger-1.png', 'Tsanger-2.png'] }) });
entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
if (missing.length) throw new Error(`许可证原文缺失：\n${missing.join('\n')}`);
fs.writeFileSync('licenses/notices.json', JSON.stringify({ entries }, null, 2) + '\n');
console.log(`已整理 ${entries.length} 项许可。`);
