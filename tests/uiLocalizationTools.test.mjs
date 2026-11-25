import test from "node:test";
import assert from "node:assert/strict";
import {
  setUiLanguage,
  getUiLanguage,
  uiSearchText,
} from "../src/i18n/index.ts";
import {
  formatUiDateTime,
  formatUiNumber,
  formatUiCurrency,
} from "../src/i18n/format.ts";
import { checkTranslationCatalogs } from "../scripts/check-ui-translations.mjs";

test("界面日期跟随语言并保持本地时刻，中文保留原格式", () => {
  const time = new Date(2026, 8, 25, 21, 5, 42).getTime();
  try {
    setUiLanguage("zh-CN");
    assert.equal(formatUiDateTime(time), "2026-09-25 21:05");
    for (const language of ["en", "ja"]) {
      setUiLanguage(language);
      assert.equal(
        formatUiDateTime(time),
        new Intl.DateTimeFormat(language, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(time)),
      );
    }
    assert.equal(formatUiDateTime(null), "—");
    assert.equal(formatUiDateTime(NaN), "—");
  } finally {
    setUiLanguage("zh-CN");
  }
});
test("界面金额明确人民币币种，不改变数值", () => {
  try {
    setUiLanguage("en");
    assert.equal(formatUiNumber(1234.5), "1,234.5");
    assert.equal(formatUiCurrency(1234.5), "CNY 1,234.50");
    setUiLanguage("ja");
    assert.equal(formatUiCurrency(12), "CNY 12");
    setUiLanguage("zh-CN");
    assert.equal(formatUiCurrency(1234.5), "¥1,234.50");
  } finally {
    setUiLanguage("zh-CN");
  }
});
test("搜索包含四种语言且不切换当前语言", () => {
  try {
    setUiLanguage("en");
    const text = uiSearchText(
      "settingsPanel.SETTINGS_SEARCH_ENTRIES.label28",
      "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords28",
    );
    assert.ok(text.includes("置顶"));
    assert.ok(text.includes("置頂"));
    assert.ok(text.includes("pinned"));
    assert.ok(text.includes("ピン留め"));
    assert.equal(getUiLanguage(), "en");
  } finally {
    setUiLanguage("zh-CN");
  }
});
test("翻译检查报告缺失、多余标识与参数变化，允许有意留空", () => {
  const source = {
    label: "标题",
    suffix: " 条",
    count: "{count} 条",
    "backend.error": "无法读取 {path:?}",
  };
  assert.deepEqual(
    checkTranslationCatalogs({
      "zh-CN": source,
      en: {
        label: "Title",
        suffix: "",
        count: "{count} items",
        "backend.error": "Cannot read {path:?}",
      },
    }),
    [],
  );
  const errors = checkTranslationCatalogs({
    "zh-CN": source,
    en: {
      count: "{total} items",
      extra: "extra",
      "backend.error": "Cannot read {path}",
    },
  });
  assert.ok(errors.some((e) => e.includes("label")));
  assert.ok(errors.some((e) => e.includes("extra")));
  assert.ok(errors.some((e) => e.includes("count")));
  assert.ok(errors.some((e) => e.includes("backend.error")));
  assert.ok(
    checkTranslationCatalogs({
      "zh-CN": { label: "标题" },
      en: { label: "" },
    }).some((e) => e.includes("空白文案")),
  );
});
