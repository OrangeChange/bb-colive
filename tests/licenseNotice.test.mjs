import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const license = readFileSync(fileURLToPath(new URL("../src-tauri/licenses/MiSans-授权说明.txt", import.meta.url)), "utf8");

test("MiSans 随包授权说明包含官方协议名称、归属和主要使用条件", () => {
  assert.match(license, /MiSans 字体知识产权许可协议/);
  assert.match(license, /小米科技有限责任公司/);
  assert.match(license, /https:\/\/hyperos\.mi\.com\/font\//);
  assert.match(license, /应在软件中特别注明使用了 MiSans 字体/);
  assert.match(license, /不得对 MiSans 字体或其任何单独组件进行改编或二次开发/);
  assert.match(license, /不得单独将 MiSans 字体或其组件对外租赁/);
  assert.doesNotMatch(license, /后续补档|随包未附原版声明文件/);
});
