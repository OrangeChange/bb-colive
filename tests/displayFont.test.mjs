import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fontPaths = [
  join(projectRoot, "src", "assets", "fonts", "TsangerYuMo-W02.subset.woff2"),
  join(projectRoot, "src", "assets", "fonts", "TsangerYuMo-W03.subset.woff2"),
];
const emptyStateText = "输入房间号，开始记录现场。";

test("空态引导语的每个字符都存在于展示字体子集", () => {
  const script = [
    "import sys",
    "from fontTools.ttLib import TTFont",
    "font = TTFont(sys.argv[1])",
    "chars = set()",
    "[chars.update(table.cmap.keys()) for table in font['cmap'].tables]",
    "missing = ''.join(ch for ch in sys.argv[2] if ord(ch) not in chars)",
    "print(missing)",
  ].join("; ");

  for (const fontPath of fontPaths) {
    const result = spawnSync("python", ["-X", "utf8", "-c", script, fontPath, emptyStateText], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `无法检查字体子集：${fontPath}\n${result.stderr}`);
    assert.equal(result.stdout.trim(), "", `字体缺少空态文案字符：${fontPath}`);
  }
});
