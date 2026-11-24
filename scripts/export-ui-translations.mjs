import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/zh-CN.json"), "utf8"));
const usage = new Map(Object.keys(catalog).map(key => [key, []]));

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

for (const file of [...files(path.join(root, "src")), ...files(path.join(root, "src-tauri/src")), path.join(root, "vite.config.ts")]) {
  if (!/\.(ts|tsx|rs)$/.test(file) || file.includes(`${path.sep}i18n${path.sep}`)) continue;
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (file.endsWith(".rs")) {
    for (const match of source.matchAll(/ui_(?:text|format)!\("([^"]+)"/g)) {
      usage.get(match[1])?.push(`${relative}:${source.slice(0, match.index).split("\n").length}`);
    }
    continue;
  }
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteral(node) && usage.has(node.text)) {
      usage.get(node.text).push(`${relative}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

const quote = value => `"${String(value).replaceAll('"', '""')}"`;
const rows = [["标识", "模块", "使用位置", "简体中文原文", "繁体中文（zh-Hant）", "英文（en）", "日语（ja）", "变量", "翻译备注"]];
for (const [key, text] of Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b, "en"))) {
  const locations = [...new Set(usage.get(key))];
  if (!locations.length) continue;
  const backend = key.startsWith("backend.");
  const parameters = [...new Set([...text.matchAll(backend ? /(?<!\{)\{([^{}]*)\}(?!\})/g : /\{([A-Za-z_$][\w$]*)\}/g)].map(match => match[1] || "按原顺序填入"))];
  const notes = [backend ? "原生菜单或后台提示；保持Rust占位符及格式说明原样。" : "仅软件操作界面；保持占位符名称原样，可按语序移动。"];
  if (text.includes("\n")) notes.push("保留换行。");
  if (/^\s|\s$/.test(text)) notes.push("保留首尾空格。");
  if (/\{|\}|<|>|`/.test(text) && !parameters.length) notes.push("包含代码或格式示例，请保留代码部分。");
  if (/^(元|秒|分钟|天|月|条|级|次)$/.test(text.trim())) notes.push("界面单位，不改变数值或换算规则。");
  rows.push([key, key.split(".")[0] === "backend" ? key.split(".").slice(0, 2).join(".") : key.split(".")[0], locations.join("\n"), text, "", "", "", parameters.join("、"), notes.join(" ")]);
}
const destination = path.join(root, "docs/translations/ui-translation-list.csv");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, "\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n");
console.log(`翻译清单：${rows.length - 1}条，${path.relative(root, destination)}`);
