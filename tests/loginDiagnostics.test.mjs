import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

test("登录恢复和扫码流程写入功能诊断，但不写入 cookie 或令牌", () => {
  const login = read("../src/protocol/login.ts");
  const session = read("../src/stores/session.ts");
  assert.match(login, /recordFeatureDiagnostic/);
  assert.match(login, /featureId:\s*["']session["']/);
  assert.match(session, /recordFeatureDiagnostic/);
  assert.match(session, /featureId:\s*["']session["']/);
  assert.doesNotMatch(login, /data:\s*\{[^}]*cookie/si);
  assert.doesNotMatch(login, /data:\s*\{[^}]*token/si);
});
