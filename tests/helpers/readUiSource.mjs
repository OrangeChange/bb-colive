import fs from "node:fs";
import ts from "typescript";

const messages = JSON.parse(fs.readFileSync(new URL("../../src/i18n/zh-CN.json", import.meta.url), "utf8"));

export async function readUiSourceAsync(file, encoding = "utf8") {
  return readUiSource(file, encoding);
}

/** 源码契约检查同时读取实际引用的中文资源，保留原有文案断言。 */
export function readUiSource(file, encoding = "utf8") {
  let source = fs.readFileSync(file, encoding);
  const name = String(file);
  if (!/\.(?:tsx?|mjs|rs)$/.test(name)) return source;
  if (name.endsWith(".rs")) {
    return source.replace(/ui_text!\("([^"]+)"\)/g, (_, key) => JSON.stringify(messages[key]))
      .replace(/ui_format!\("([^"]+)"/g, (_, key) => `format!(${JSON.stringify(messages[key])}`);
  }
  const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "uiSearchText" && node.arguments.every(ts.isStringLiteral)) {
      const catalogs = ["zh-CN", "zh-Hant", "en", "ja"].map(language => JSON.parse(fs.readFileSync(new URL(`../../src/i18n/${language}.json`, import.meta.url), "utf8")));
      const text = [...new Set(node.arguments.flatMap(argument => catalogs.map(catalog => catalog[argument.text] ?? messages[argument.text])))].join(" ").toLowerCase();
      edits.push({ start: node.getStart(tree), end: node.end, text: JSON.stringify(text) });
      return;
    }
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "uiText" && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (!(key in messages)) throw new Error(`未找到文案：${key}`);
      let text = messages[key];
      const parameters = node.arguments[1];
      if (parameters && ts.isObjectLiteralExpression(parameters)) {
        const values = Object.fromEntries(parameters.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(tree), property.initializer.getText(tree)]));
        text = "`" + text.replaceAll("`", "\\`").replace(/\{([A-Za-z_$][\w$]*)\}/g, (original, key) => values[key] === undefined ? original : "${" + values[key] + "}") + "`";
      } else {
        text = JSON.stringify(text);
      }
      if (ts.isJsxExpression(node.parent) && !parameters && (ts.isJsxAttribute(node.parent.parent) || ts.isJsxElement(node.parent.parent) || ts.isJsxFragment(node.parent.parent))) {
        const start = node.parent.getStart(tree);
        const jsxText = source[start - 1] === " " && messages[key].startsWith(" ") ? messages[key].slice(1) : messages[key];
        edits.push({ start, end: node.parent.end, text: ts.isJsxAttribute(node.parent.parent) ? text : jsxText });
      } else {
        edits.push({ start: node.getStart(tree), end: node.end, text });
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (!source.includes("uiText(")) source = source.replace(/^import \{ uiText \} from [^\n]+\n/m, "");
  return source;
}
