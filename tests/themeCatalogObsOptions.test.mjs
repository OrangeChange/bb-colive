import test from "node:test";
import assert from "node:assert/strict";
import { obsThemeOptions } from "../src/obs/nativeObsConfigurations.ts";

test("OBS同名主题按兼容格式区分，唯一名称保留原名", () => {
  const options = obsThemeOptions({ themeId: "a" }, [
    { themeId: "a", name: "经典", mode: "blivechat" },
    { themeId: "b", name: "经典", mode: "blivechat-open" },
    { themeId: "c", name: "基础气泡", mode: "blivechat-open" },
  ]);
  assert.deepEqual(options.map(item => item.label), ["经典 · BLC 原版", "经典 · BLC 开放版", "基础气泡"]);
  assert.deepEqual(options.map(item => item.value), ["a", "b", "c"]);
});

 test('OBS主题按样式分组',()=>{
 const options=obsThemeOptions({themeId:'a'},[{themeId:'a',name:'原生默认',mode:'native'},{themeId:'b',name:'经典',mode:'blivechat-open'}]);
 assert.deepEqual(options.map(item=>item.group),['原生样式','BLC 开放版']);
 });
