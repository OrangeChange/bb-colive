import assert from "node:assert/strict";
import test from "node:test";

const naming = await import("../src/diagnostics/diagnosticBridge.ts");
const { buildDiagnosticExportFileName, getDiagnosticExportId } = naming;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("诊断导出短标识首次生成后保持稳定且为五位", () => {
  const storage = createMemoryStorage();
  const first = getDiagnosticExportId(storage, () => 0);
  const second = getDiagnosticExportId(storage, () => 0.99);

  assert.match(first, /^[A-Z2-9]{5}$/);
  assert.equal(second, first);
});

test("诊断导出默认文件名使用类型、短标识和短时间", () => {
  assert.equal(
    buildDiagnosticExportFileName("24h", "T7K3M", new Date(2026, 8, 14, 4, 25)),
    "bb-colive-24h-T7K3M-260914-0425.zip",
  );
  assert.equal(
    buildDiagnosticExportFileName("full", "T7K3M", new Date(2026, 8, 14, 4, 25)),
    "bb-colive-full-T7K3M-260914-0425.zip",
  );
});
