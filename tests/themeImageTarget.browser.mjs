import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const output = await build({
  stdin: {
    contents:
      'import {inspectImageTarget} from "./src/components/themeImageTarget.ts";window.inspectImageTarget=inspectImageTarget;',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<style>#parent{transform:translateX(0);overflow:hidden}#occupied::before{content:"existing"}#contents{display:contents}</style><div id="parent"><span id="target">text</span><span id="occupied"></span><span id="contents">text</span><img id="image"></div>',
  );
  await page.addScriptTag({ content: output.outputFiles[0].text });
  const result = await page.evaluate(() =>
    Object.fromEntries(
      ["target", "occupied", "contents", "image"].map((id) => {
        const r = window.inspectImageTarget(document.getElementById(id));
        return [
          id,
          {
            box: r.box,
            replaced: r.replaced,
            reference: r.reference?.id,
            clipping: r.clipping.length,
            before: r.before.occupied,
          },
        ];
      }),
    ),
  );
  assert.equal(result.target.reference, "parent");
  assert.equal(result.target.clipping, 1);
  assert.equal(result.occupied.before, true);
  assert.equal(result.contents.box, false);
  assert.equal(result.image.replaced, true);
  console.log("定位参照、祖先裁切、伪元素占用、无盒目标及图片节点判断通过");
} finally {
  await browser.close();
}
