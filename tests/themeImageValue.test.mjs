import test from "node:test";
import assert from "node:assert/strict";
import {
  imagePositionCss,
  readImageBackground,
  writeImageBackground,
  moveImageLayer,
  serializeImageBackground,
  backgroundAnchorPosition,
  resolveImageLengthCss,
  scaleImageLengthCss,
  mergeImageBackground,
} from "../src/components/themeImageValue.ts";

test("修改填充保留同素材图片的独立尺寸、标识和隐藏层", () => {
  const layer = (id, size, visible = true) => ({
    id,
    image: 'url("same.png")',
    size,
    visible,
    position: "center",
    repeat: "no-repeat",
    origin: "padding-box",
    clip: "border-box",
    attachment: "scroll",
  });
  const first = layer("first", "200px 100px"),
    second = layer("second", "120px 60px"),
    hidden = layer("hidden", "80px 40px", false);
  const original = { color: "red", layers: [first, hidden, second] };
  const parsed = {
    color: "blue",
    layers: [
      { ...first, id: "image-0" },
      { ...second, id: "image-1" },
    ],
  };
  const result = mergeImageBackground(original, parsed);
  assert.deepEqual(
    result.layers.map((x) => [x.id, x.size, x.visible]),
    [
      ["first", "200px 100px", true],
      ["hidden", "80px 40px", false],
      ["second", "120px 60px", true],
    ],
  );
  assert.equal(result.color, "blue");
});

test("图片尺寸按当前基准字号解析，百分比不变", () => {
  const css = scaleImageLengthCss("80px 50%", {
    variable: "--event-base-size",
    value: 16,
  });
  assert.equal(
    resolveImageLengthCss(css, { variable: "--event-base-size", value: 20 }),
    "100px 50%",
  );
  const blc = scaleImageLengthCss("80px", { variable: "--blc-g", value: 2 });
  assert.equal(
    resolveImageLengthCss(blc, { variable: "--blc-g", value: 3 }),
    "120px",
  );
});

test("透明背景不生成 initial 图片层", () => {
  const draft = readImageBackground({
    backgroundImage: "initial",
    backgroundColor: "transparent",
    backgroundSize: "initial",
    backgroundPosition: "initial",
    backgroundRepeat: "initial",
    backgroundOrigin: "initial",
    backgroundClip: "initial",
    backgroundAttachment: "initial",
  });
  assert.deepEqual(draft.layers, []);
  assert.equal(serializeImageBackground(draft), "transparent");
});

test("背景锚点补偿同时考虑图片尺寸和包含块移动百分比", () => {
  assert.equal(
    backgroundAnchorPosition(
      50,
      { value: 50, unit: "%" },
      { value: 20, unit: "px" },
      80,
    ),
    "calc(50% + 20px)",
  );
  assert.equal(
    backgroundAnchorPosition(
      100,
      { value: 50, unit: "%" },
      { value: 10, unit: "%" },
      80,
    ),
    "calc(110% + 48px)",
  );
});

test("图片锚点与移动使用各自的参照", () => {
  const result = imagePositionCss({
    alignment: [50, 50],
    anchor: [
      { value: 50, unit: "%" },
      { value: 50, unit: "%" },
    ],
    move: [
      { value: 20, unit: "px" },
      { value: 10, unit: "%" },
    ],
    flow: false,
  });
  assert.equal(result.left, "calc(50% + 20px)");
  assert.equal(result.top, "calc(50% + 10%)");
  assert.equal(result.transform, "translate(-50%, -50%)");
});
test("图片编辑输出完整背景层，不用简写重置其他层配置", () => {
  const draft = readImageBackground({
    backgroundImage: 'url("a.png"), linear-gradient(red, blue)',
    backgroundColor: "rgb(1, 2, 3)",
    backgroundSize: "40px 20px, cover",
    backgroundPosition: "left top",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    backgroundAttachment: "scroll",
  });
  assert.equal(
    serializeImageBackground(draft),
    'url("a.png") left top / 40px 20px no-repeat scroll padding-box border-box, linear-gradient(red, blue) left top / cover no-repeat scroll padding-box border-box rgb(1, 2, 3)',
  );
});
test("CSSOM 初始长属性转成背景层的有效默认值", () => {
  const draft = readImageBackground({
    backgroundImage: 'url("a.png")',
    backgroundColor: "transparent",
    backgroundSize: "initial",
    backgroundPosition: "initial",
    backgroundRepeat: "initial",
    backgroundOrigin: "initial",
    backgroundClip: "initial",
    backgroundAttachment: "initial",
  });
  assert.equal(draft.layers[0].size, "auto");
  assert.equal(draft.layers[0].origin, "padding-box");
  assert.doesNotMatch(serializeImageBackground(draft), /initial/);
});
test("随文图片只添加移动和自身锚点补偿", () => {
  const result = imagePositionCss({
    alignment: [50, 50],
    anchor: [
      { value: 12, unit: "px" },
      { value: 0, unit: "%" },
    ],
    move: [
      { value: -2, unit: "px" },
      { value: 3, unit: "px" },
    ],
    flow: true,
  });
  assert.equal(result.position, "relative");
  assert.equal(result.left, "-2px");
  assert.equal(result.transform, "translate(-12px, 0%)");
});
test("背景长属性循环值逐层对应，重排不损坏渐变与底色", () => {
  const draft = readImageBackground({
    backgroundImage: 'url("a,b.png"), linear-gradient(red, blue), url("c.png")',
    backgroundColor: "rgb(1, 2, 3)",
    backgroundSize: "40px 20px, cover",
    backgroundPosition: "left top",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    backgroundAttachment: "scroll",
  });
  assert.equal(draft.layers.length, 3);
  assert.equal(draft.layers[2].size, "40px 20px");
  const next = writeImageBackground(moveImageLayer(draft, 2, 0));
  assert.equal(
    next.backgroundImage,
    'url("c.png"), url("a,b.png"), linear-gradient(red, blue)',
  );
  assert.equal(next.backgroundSize, "40px 20px, 40px 20px, cover");
  assert.equal(next.backgroundColor, "rgb(1, 2, 3)");
});


test('原生图片比例使用公共字号并可反解，兼容变量保持支持',()=>{
 const value=scaleImageLengthCss('24px',{variable:'--event-font-size',value:16});
 assert.equal(resolveImageLengthCss(value,{variable:'--event-font-size',value:24}),'36px');
 assert.equal(resolveImageLengthCss('calc(var(--event-base-size, 20px) * 2)',{variable:'--event-base-size',value:30}),'60px');
});
