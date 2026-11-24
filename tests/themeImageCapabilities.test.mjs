import test from "node:test";
import assert from "node:assert/strict";
import { BLIVECHAT_CAPABILITY } from "../src/compat/blivechat/theme.ts";
import { OPENLIVE_CAPABILITY } from "../src/compat/openlive/theme.ts";
import { LAPLACE_CAPABILITY } from "../src/compat/laplace/theme.ts";
import { renderCompatibleManagedCss } from "../src/themes/compatManagedCss.ts";

for (const capability of [
  BLIVECHAT_CAPABILITY,
  OPENLIVE_CAPABILITY,
  LAPLACE_CAPABILITY,
]) {
  test(`${capability.mode} 的图片边框保持当前事件与位置范围`, () => {
    const value = 'url("assets/frame.png") 20 fill / 12px / 0px stretch';
    const model = {
      common: {
        "danmaku|all|main|event": { borderImage: { source: "custom", value } },
      },
      light: {},
      dark: {},
    };
    const css = renderCompatibleManagedCss(capability, model);
    assert.match(css, /border-image: url\("assets\/frame.png"\)/);
    assert.ok(css.includes("compat-visual:common|danmaku|all|main|event"));
    assert.doesNotMatch(css, /compat-visual:common\|danmaku\|all\|sticky/);
  });
}
