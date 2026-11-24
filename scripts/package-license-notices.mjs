import fs from 'node:fs';
import path from 'node:path';
const entries = JSON.parse(fs.readFileSync('licenses/notices.json', 'utf8')).entries;
const directory = 'licenses/distribution';
fs.mkdirSync(directory, { recursive: true });
const groups = new Map();
for (const entry of entries) {
  const text = entry.id === 'font/仓耳与墨'
    ? '仓耳与墨字体授权原件见同目录 Tsanger.pdf。'
    : entry.text.trim();
  const items = groups.get(text) ?? [];
  items.push(entry); groups.set(text, items);
}
const output = ['BB CoLive · 软件与第三方许可声明', fs.readFileSync('LICENSE', 'utf8').trim()];
for (const [text, items] of groups) {
  output.push(items.map(item => `${item.name} ${item.version}\n${item.license}\n${item.url}`).join('\n\n') + '\n\n' + text);
}
fs.writeFileSync(path.join(directory, 'THIRD_PARTY_NOTICES.txt'), output.join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
fs.copyFileSync('licenses/fonts/Tsanger.pdf', path.join(directory, 'Tsanger.pdf'));
console.log(`已整理 ${entries.length} 项声明，合并为 ${groups.size} 组原文。`);
