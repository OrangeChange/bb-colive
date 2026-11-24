import test from "node:test";
import assert from "node:assert/strict";
import { rebaseThemeResourceOrigin } from "../src/themes/themeResourceOrigin.ts";

test("OBS更换服务端口后重新解析主题与另存主题资源，不修改消息和远程URL", () => {
  const source = { css: 'url("http://127.0.0.1:17920/theme-catalog/assets/font.woff2")', document: { styles: { baseCss: 'url(http://localhost:17920/theme-assets/copy/avatar.png)' } }, text: "http://127.0.0.1:17920/theme-assets/a/b", customCss: 'url(https://example.com/font.woff2)' };
  const next = rebaseThemeResourceOrigin(source, "http://127.0.0.1:17921");
  assert.match(next.css, /17921\/theme-catalog/);
  assert.match(next.document.styles.baseCss, /17921\/theme-assets/);
  assert.equal(next.text, source.text);
  assert.equal(next.customCss, source.customCss);
  assert.match(source.css, /17920/);
});
