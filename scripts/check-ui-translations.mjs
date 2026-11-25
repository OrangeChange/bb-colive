import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parameters(key, text) {
  if (key.startsWith("backend.")) {
    return [
      ...text
        .replaceAll("{{", "")
        .replaceAll("}}", "")
        .matchAll(/\{([^{}]*)\}/g),
    ]
      .map((match) => match[1])
      .sort();
  }
  return [
    ...new Set(
      [...text.matchAll(/\{([A-Za-z_$][\w$]*)\}/g)].map((match) => match[1]),
    ),
  ].sort();
}

export function checkTranslationCatalogs(catalogs) {
  const source = catalogs["zh-CN"];
  const errors = [];
  for (const [language, catalog] of Object.entries(catalogs)) {
    for (const [key, text] of Object.entries(source)) {
      if (typeof catalog[key] !== "string")
        errors.push(`${language}: 缺失或无效的文案 ${key}`);
      else if (!catalog[key].trim() && !/^(个|位|条|人)$/.test(text.trim()))
        errors.push(`${language}: 空白文案 ${key}`);
      else if (
        JSON.stringify(parameters(key, text)) !==
        JSON.stringify(parameters(key, catalog[key]))
      )
        errors.push(`${language}: 参数不一致 ${key}`);
    }
    for (const key of Object.keys(catalog))
      if (!(key in source)) errors.push(`${language}: 多余的文案标识 ${key}`);
  }
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("../src/i18n/", import.meta.url));
  const catalogs = Object.fromEntries(
    ["zh-CN", "zh-Hant", "en", "ja"].map((language) => [
      language,
      JSON.parse(fs.readFileSync(path.join(root, `${language}.json`), "utf8")),
    ]),
  );
  const errors = checkTranslationCatalogs(catalogs);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("界面翻译标识及参数一致。");
}
